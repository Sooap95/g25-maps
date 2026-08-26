function analyze() {
  const parsed = parseG25($("targetInput").value);
  if (!parsed.length) {
    toast("Collez une ligne G25 (nom + 25 nombres).");
    return;
  }
  state.target = parsed[0];
  const samples = allSamples();
  const distances = samples.map((s) => ({
    n: s.n,
    d: euclid(state.target.c, s.c),
    iso3: s.iso3,
    role: s.role,
    custom: !!s.custom,
    src: sourceLabel(s),
  }));
  distances.sort((a, b) => a.d - b.d);
  state.distances = distances;
  $("statN").textContent = String(samples.length);
  $("statBest").textContent = distances[0] ? distances[0].n : "—";
  $("statBestD").textContent = distances[0] ? formatDist(distances[0].d) : "—";
  $("targetName").textContent = state.target.n;
  paintMap();
  renderTable();
  try {
    localStorage.setItem("g25-last-target", $("targetInput").value);
  } catch (_) {}
}

function fillExample(name) {
  const s = state.samples.find((x) => x.n === name);
  if (!s) return;
  $("targetInput").value = `${s.n},${s.c.join(",")}`;
  analyze();
}

function assetUrl(rel) {
  const path = location.pathname.replace(/index\.html$/i, "");
  const base = path.endsWith("/") ? path : `${path}/`;
  return `${base}${String(rel).replace(/^\//, "")}`;
}

function dataFallbackUrls(rel) {
  const clean = String(rel).replace(/^\//, "");
  return [
    assetUrl(clean),
    `https://cdn.jsdelivr.net/gh/Sooap95/g25-maps@gh-pages/${clean}`,
    `https://raw.githubusercontent.com/Sooap95/g25-maps/gh-pages/${clean}`,
  ];
}

async function loadJson(url) {
  const candidates = dataFallbackUrls(url);
  let lastErr;
  for (const src of candidates) {
    try {
      const res = await fetch(src);
      if (!res.ok) {
        lastErr = new Error(`Impossible de charger ${url} (${res.status})`);
        continue;
      }
      const type = (res.headers.get("content-type") || "").toLowerCase();
      if (type.includes("text/html")) {
        lastErr = new Error(`Impossible de charger ${url} (HTML)`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`Impossible de charger ${url}`);
}

async function loadDepositsFile() {
  try {
    const data = await loadJson("data/deposits.json");
    const arr = Array.isArray(data) ? data : data.deposits || [];
    state.fileDeposits = arr.filter((d) => d?.n && Array.isArray(d.c) && d.c.length === 25);
  } catch (_) {
    state.fileDeposits = [];
  }
}

/**
 * Normalise le champ `source` de samples.json.
 * Accepte l'ancien format (une simple chaîne) comme le nouveau (objet ou
 * tableau d'objets), pour qu'un fichier de données existant reste valide.
 */
function normalizeSources(raw) {
  const one = (v) => {
    if (!v) return null;
    if (typeof v === "string") return { id: "base", title: v };
    return {
      id: v.id || "base",
      title: v.title || v.name || "Source sans titre",
      short: v.short || null,
      url: v.url || null,
      retrieved: v.retrieved || null,
      notes: v.notes || null,
      license: v.license || null,
    };
  };
  const arr = Array.isArray(raw) ? raw.map(one) : [one(raw)];
  return arr.filter(Boolean);
}

/** Source d'un échantillon : son `src` explicite, sinon la source de base. */
function sourceOf(sample) {
  if (sample?.custom) return { id: "deposit", title: "Dépôt local (ce navigateur)" };
  const id = sample?.src;
  if (id) return state.sources.find((s) => s.id === id) || { id, title: id };
  return state.sources[0] || null;
}

/** Libellé court, pour les popups et le tableau. */
function sourceLabel(sample) {
  const s = sourceOf(sample);
  if (!s) return "";
  return s.short || s.title;
}

function renderSources() {
  const box = $("sourceList");
  if (!box) return;
  const rows = state.sources.map((s) => {
    const bits = [];
    if (s.retrieved) bits.push(`relevé ${escapeHtml(s.retrieved)}`);
    if (s.license) bits.push(escapeHtml(s.license));
    const meta = bits.length ? `<div class="hint">${bits.join(" · ")}</div>` : "";
    const link = s.url
      ? `<div class="hint"><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.url)}</a></div>`
      : "";
    const notes = s.notes ? `<div class="hint">${escapeHtml(s.notes)}</div>` : "";
    return `<div class="src-item"><b>${escapeHtml(s.title)}</b>${meta}${link}${notes}</div>`;
  });
  rows.push(
    `<div class="src-item"><b>Fonds de carte</b>` +
      `<div class="hint">Natural Earth (monde, Europe) · IGN/Etalab Admin Express (France) · Eurostat NUTS (sous-régions)</div></div>`
  );
  rows.push(
    `<div class="src-item"><b>Métrique</b>` +
      `<div class="hint">Distance euclidienne sur ${state.dims} dimensions, coordonnées <i>scaled</i>. ` +
      `Un pays prend la distance de son échantillon le plus proche.</div></div>`
  );
  box.innerHTML = rows.join("");
}

/** Ligne d'attribution Leaflet, construite depuis les données chargées. */
function attributionText() {
  const names = state.sources.map((s) => s.short || s.title);
  return [...names, "Natural Earth", "IGN/Etalab", "Eurostat NUTS"].join(" · ");
}

/**
 * Bascule de jeu de données.
 *
 * Les jeux ne sont pas chargés d'avance : les anciens pèsent 1,6 Mo, et tout
 * charger au démarrage coûterait plusieurs secondes pour des données que
 * l'utilisateur ne consultera peut-être jamais. On ne récupère donc que le jeu
 * sélectionné, et on garde en mémoire ceux déjà vus.
 */
async function selectDataset(id, { keepTarget = true } = {}) {
  const spec = state.datasets.find((d) => d.id === id);
  if (!spec) return;

  const sel = $("dataset");
  sel.disabled = true;
  $("datasetHint").textContent = "Chargement…";

  try {
    let doc = state.datasetCache[id];
    if (!doc) {
      doc = await loadJson(spec.file);
      state.datasetCache[id] = doc;
    }
    state.currentDataset = id;
    state.samples = doc.samples;
    state.sources = normalizeSources(doc.sources || doc.source);
    state.dims = doc.dims || 25;

    state.map.attributionControl.removeAttribution(state.attribution);
    state.attribution = attributionText();
    state.map.attributionControl.addAttribution(state.attribution);

    renderSources();
    populateCountrySelect();
    $("statN").textContent = String(allSamples().length);
    describeDataset(spec);

    // Le modèle d'admixture porte sur l'ancien jeu : il ne veut plus rien dire.
    state.admix = null;
    $("admixResult").innerHTML = `<p class="hint">Relancez le calcul sur ce jeu.</p>`;

    if (keepTarget && state.target) analyze();
    else {
      paintMap();
      renderTable();
    }
  } catch (e) {
    toast("Chargement impossible : " + (e && e.message ? e.message : e));
    $("datasetHint").textContent = "Échec du chargement.";
  } finally {
    sel.disabled = false;
  }
}

function describeDataset(spec) {
  const pct = spec.count ? Math.round((100 * spec.tagged) / spec.count) : 0;
  $("datasetHint").textContent =
    `${spec.count.toLocaleString("fr-FR")} échantillons · ${pct} % localisables sur la carte. ` +
    (spec.kind === "ancient"
      ? "Jeu ancien : les distances se lisent par rapport à des populations disparues."
      : "");
}

function renderDatasetSelect() {
  const sel = $("dataset");
  sel.innerHTML = state.datasets
    .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.short || d.title)}</option>`)
    .join("");
  sel.value = state.currentDataset;
}

function populateCountrySelect() {
  const sel = $("depIso");
  const names = new Map();
  const world = state.geo.world;
  if (world) {
    for (const f of world.features) names.set(f.properties.iso3, f.properties.name);
  }
  const opts = ['<option value="">— pays —</option>'];
  [...names.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "fr"))
    .forEach(([iso, name]) => {
      opts.push(`<option value="${iso}">${name} (${iso})</option>`);
    });
  sel.innerHTML = opts.join("");

  const reg = $("depRegion");
  reg.innerHTML =
    '<option value="">— région FR —</option>' +
    FR_REGIONS.map((r) => `<option value="${r.code}">${r.nom}</option>`).join("");
}
