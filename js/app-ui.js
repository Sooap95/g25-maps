/**
 * Un dépôt ou un filtre change le vivier : la couverture des cartes, les
 * distances et le modèle doivent tous être refaits ensemble, sans quoi la
 * carte, la table et l'admixture raconteraient trois histoires différentes.
 */
function refreshPool({ message } = {}) {
  resetCoverage();
  const moved = ensureUsableMap();
  renderTabs();
  $("statCustom").textContent = String(state.deposits.length + state.fileDeposits.length);
  updateFilterHint();
  recompute();
  if (moved) toast(`« ${moved.from} » n’est plus couvert — passage à « ${moved.to} ».`);
  else if (message) toast(message);
  syncPermalink();
}

function updateFilterHint() {
  const box = $("filterHint");
  if (!box) return;
  const { total, kept, dropped } = filterSummary();
  box.textContent = dropped
    ? `${kept} échantillons retenus sur ${total} — ${dropped} écartés par vos filtres.`
    : `${total} échantillons, aucun filtre actif.`;
  box.classList.toggle("warn-text", kept < 20 && total >= 20);
}

/* ------------------------------------------------------------------ frise */

let tlTimer = null;

function renderTimeline() {
  const box = $("timeline");
  const range = datasetYearRange(state.samples);
  if (!range || range.count < 15) {
    box.hidden = true;
    stopTimeline();
    FILTERS.yMin = FILTERS.yMax = null;
    return;
  }
  box.hidden = false;
  for (const id of ["tlMin", "tlMax"]) {
    const el = $(id);
    el.min = range.min;
    el.max = range.max;
    el.step = Math.max(1, Math.round((range.max - range.min) / 400));
  }
  $("tlMin").value = FILTERS.yMin ?? range.min;
  $("tlMax").value = FILTERS.yMax ?? range.max;
  state.yearRange = range;
  renderTimelineMarks(range);
  updateTimelineLabels();
}

/** Repères de période sous la frise, pour situer le curseur sans compter. */
function renderTimelineMarks(range) {
  const box = $("tlMarks");
  const span = Math.max(1, range.max - range.min);
  const present = new Set(state.samples.map((s) => s.p).filter(Boolean));
  box.innerHTML = "";
  for (const [code, label] of PERIOD_LABELS) {
    if (!present.has(code)) continue;
    const years = state.samples.filter((s) => s.p === code && s.y != null).map((s) => s.y);
    if (!years.length) continue;
    const a = Math.max(range.min, Math.min(...years));
    const b = Math.min(range.max, Math.max(...years));
    if (b <= a) continue;
    const el = document.createElement("span");
    el.className = `tl-mark tl-${code}`;
    el.style.left = `${(100 * (a - range.min)) / span}%`;
    el.style.width = `${(100 * (b - a)) / span}%`;
    el.textContent = label;
    el.title = `${label} — ${formatYear(a)} à ${formatYear(b)}`;
    box.appendChild(el);
  }
}

function updateTimelineLabels() {
  $("tlMinVal").textContent = formatYear(Number($("tlMin").value));
  $("tlMaxVal").textContent = formatYear(Number($("tlMax").value));
}

function applyTimeline() {
  let lo = Number($("tlMin").value);
  let hi = Number($("tlMax").value);
  // Les deux curseurs partagent la même piste : rien n'empêche de croiser le
  // début et la fin, on remet donc l'intervalle à l'endroit.
  if (lo > hi) [lo, hi] = [hi, lo];
  const range = state.yearRange;
  FILTERS.yMin = range && lo <= range.min ? null : lo;
  FILTERS.yMax = range && hi >= range.max ? null : hi;
  updateTimelineLabels();
  refreshPool();
}

function resetTimeline() {
  stopTimeline();
  const range = state.yearRange;
  if (!range) return;
  $("tlMin").value = range.min;
  $("tlMax").value = range.max;
  FILTERS.yMin = FILTERS.yMax = null;
  updateTimelineLabels();
  refreshPool();
}

/**
 * Défilement automatique : une fenêtre glissante parcourt la frise.
 * C'est là que le jeu ancien devient lisible — on voit les populations
 * proches se déplacer d'une période à l'autre, ce qu'aucune vue figée ne montre.
 */
function toggleTimeline() {
  if (tlTimer) return stopTimeline();
  const range = state.yearRange;
  if (!range) return;
  const span = range.max - range.min;
  const win = Math.max(200, Math.round(span * 0.18));
  let lo = range.min;
  $("tlPlay").textContent = "■ Arrêter";
  tlTimer = setInterval(() => {
    lo += Math.round(span * 0.04);
    if (lo + win > range.max) lo = range.min;
    $("tlMin").value = lo;
    $("tlMax").value = lo + win;
    applyTimeline();
  }, 900);
  applyTimeline();
}

function stopTimeline() {
  if (tlTimer) clearInterval(tlTimer);
  tlTimer = null;
  const btn = $("tlPlay");
  if (btn) btn.textContent = "▶ Animer";
}

/* --------------------------------------------------------------- périodes */

function renderPeriodChips() {
  const box = $("periodChips");
  const present = new Set(state.samples.map((s) => s.p).filter(Boolean));
  box.innerHTML = "";
  if (!present.size) {
    box.innerHTML = `<span class="hint">Ce jeu ne porte pas de période.</span>`;
    return;
  }
  for (const [code, label] of PERIOD_LABELS) {
    if (!present.has(code)) continue;
    const n = state.samples.filter((s) => s.p === code).length;
    const b = document.createElement("button");
    b.className = "chip toggle" + (FILTERS.periods && !FILTERS.periods.has(code) ? " off" : " on");
    b.textContent = `${label} (${n})`;
    b.onclick = () => {
      const all = [...present];
      if (!FILTERS.periods) FILTERS.periods = new Set(all);
      if (FILTERS.periods.has(code)) FILTERS.periods.delete(code);
      else FILTERS.periods.add(code);
      // Tout sélectionné revient à ne rien filtrer : on efface l'ensemble
      // plutôt que de le garder, pour que les échantillons non datés repassent.
      if (FILTERS.periods.size === all.length) FILTERS.periods = null;
      if (FILTERS.periods && !FILTERS.periods.size) {
        FILTERS.periods = null;
        toast("Au moins une période doit rester sélectionnée.");
      }
      renderPeriodChips();
      refreshPool();
    };
    box.appendChild(b);
  }
}

/* ----------------------------------------------------------------- dépôts */

function renderDepositList() {
  const box = $("depositList");
  if (!state.deposits.length) {
    box.innerHTML = `<div class="hint">Aucun dépôt navigateur pour l’instant.</div>`;
    return;
  }
  box.innerHTML = state.deposits
    .map(
      (d) => `<div><span>${escapeHtml(d.n)} <span class="badge">${d.iso3 || "sans pays"}</span></span>
      <button data-id="${d.id}" title="Supprimer">✕</button></div>`
    )
    .join("");
  box.querySelectorAll("button").forEach((b) => {
    b.onclick = async () => {
      await deleteDeposit(b.dataset.id);
      state.deposits = await listDeposits();
      renderDepositList();
      refreshPool();
    };
  });
}

async function addDepositsFromText(text, meta = {}) {
  const parsed = parseG25(text);
  if (!parsed.length) {
    toast("Aucune ligne G25 valide.");
    return 0;
  }
  const recs = parsed.map((p) => ({
    id: newDepositId(),
    n: p.n,
    c: p.c,
    iso3: meta.iso3 || null,
    role: meta.role || "regional",
    fr_regions: meta.region ? [meta.region] : [],
    fr_depts: meta.dept ? [meta.dept] : [],
    nuts: meta.nuts ? meta.nuts.split(/[,\s]+/).filter(Boolean) : [],
    notes: meta.notes || "",
    created: Date.now(),
  }));
  await saveDeposits(recs);
  state.deposits = await listDeposits();
  renderDepositList();
  refreshPool({ message: `${recs.length} source(s) ajoutée(s) à la base locale.` });
  return recs.length;
}

function exportDeposits() {
  const payload = {
    type: "g25-maps-deposits",
    exported: new Date().toISOString(),
    deposits: state.deposits,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "g25-deposits.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportG25Txt() {
  const lines = state.deposits.map((d) => `${d.n},${d.c.join(",")}`);
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "g25-deposits.txt";
  a.click();
  URL.revokeObjectURL(a.href);
}
