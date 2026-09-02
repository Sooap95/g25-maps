/**
 * Un dépôt peut rendre une carte exploitable — ou cesser de la rendre telle.
 * À appeler après toute modification de la base locale.
 */
function refreshAfterDeposits() {
  resetCoverage();
  ensureUsableMap();
  renderTabs();
  $("statCustom").textContent = String(state.deposits.length + state.fileDeposits.length);
  if (state.target) analyze();
  else paintMap();
}

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
      refreshAfterDeposits();
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
  refreshAfterDeposits();
  toast(`${recs.length} source(s) ajoutée(s) à la base locale.`);
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
