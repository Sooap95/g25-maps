function analyze() {
  const parsed = parseG25($("targetInput").value);
  if (!parsed.length) {
    toast("Collez une ligne G25 : un nom puis 25 nombres.");
    return;
  }
  state.target = parsed[0];
  recompute();
  try {
    localStorage.setItem("g25-last-target", $("targetInput").value);
  } catch (_) {}
  syncPermalink();
}

/** Recalcule tout ce qui dépend du profil ou du vivier, sans relire la saisie. */
function recompute() {
  if (!state.target) {
    state.distances = null;
    state.sortedDistances = null;
    paintMap();
    renderTable();
    return;
  }
  const samples = pool();
  const rows = samples.map((s) => ({
    n: s.n,
    d: euclid(state.target.c, s.c),
    iso3: s.iso3,
    role: s.role,
    y: s.y ?? null,
    lat: s.lat ?? null,
    lon: s.lon ?? null,
    custom: !!s.custom,
    src: sourceLabel(s),
  }));
  rows.sort((a, b) => a.d - b.d);
  state.sortedDistances = rows.map((r) => r.d);
  // Rang en pourcentage : 100 % = la population la plus proche du vivier.
  // C'est la seule lecture qui reste valable quand on change de jeu, où les
  // distances brutes n'ont plus du tout la même étendue.
  const n = Math.max(1, rows.length - 1);
  rows.forEach((r, i) => (r.pct = 100 * (1 - i / n)));
  state.distances = rows;

  $("statN").textContent = String(rows.length);
  $("statBest").textContent = rows[0] ? rows[0].n : "—";
  $("statBestD").textContent = rows[0] ? formatDist(rows[0].d) : "—";
  $("statPct").textContent = rows[0] ? qualifyDistance(rows[0].d) : "—";
  $("targetName").textContent = state.target.n;
  updateFilterHint();
  paintMap();
  renderTable();
}

function setCompare(text) {
  const parsed = parseG25(text);
  if (!parsed.length) {
    toast("Second profil illisible : un nom puis 25 nombres.");
    return;
  }
  if (!state.target) {
    toast("Analysez d’abord un premier profil.");
    return;
  }
  state.compare = parsed[0];
  $("compareName").textContent = state.compare.n;
  toast("Mode comparaison : la carte montre l’écart entre les deux profils.");
  paintMap();
  renderTable();
  syncPermalink();
}

function clearCompare() {
  state.compare = null;
  $("compareName").textContent = "—";
  $("compareInput").value = "";
  paintMap();
  renderTable();
  syncPermalink();
}

/**
 * Profils de démonstration.
 *
 * Ils étaient codés en dur sur des noms d'échantillons (`French_Paris`) qui
 * n'existent plus depuis le changement de collection : les boutons ne faisaient
 * plus rien, et un visiteur sans coordonnées G25 n'avait aucun moyen d'essayer
 * l'outil. On les cherche donc par motif dans le jeu chargé, et on n'affiche
 * que ceux qui y ont trouvé quelque chose.
 */
const EXAMPLE_HINTS = [
  { label: "Paris", find: /ile-de-france_paris/i },
  { label: "Bretagne", find: /^breton_finistere/i },
  { label: "Occitanie", find: /occitan_occitanie_haute-garonne/i },
  { label: "Sicile", find: /^italian_sicily_\(/i },
  { label: "Gaulois", find: /_IA:/ },
  { label: "Âge du Fer", find: /_IA(_|$)/ },
  { label: "Viking", find: /viking/i },
];

function renderExamples() {
  const box = $("examples");
  if (!box) return;
  const picked = [];
  for (const hint of EXAMPLE_HINTS) {
    if (picked.length >= 4) break;
    const s = state.samples.find((x) => hint.find.test(x.n) && !picked.some((p) => p.s === x));
    if (s) picked.push({ label: hint.label, s });
  }
  // Aucun motif ne colle (jeu inattendu) : on prend les premiers échantillons,
  // pour qu'il reste toujours un moyen d'essayer l'outil en un clic.
  if (!picked.length) {
    for (const s of state.samples.slice(0, 3)) picked.push({ label: shortName(s.n), s });
  }
  box.innerHTML = "";
  for (const { label, s } of picked) {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = `ex. ${label}`;
    b.title = s.n;
    b.onclick = () => {
      $("targetInput").value = `${s.n},${s.c.join(",")}`;
      analyze();
    };
    box.appendChild(b);
  }
}

/** Étiquette lisible tirée d'un nom d'échantillon G25. */
function shortName(n) {
  return String(n).replace(/_\(n=\d+\)$/, "").replace(/_/g, " ").slice(0, 24);
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
      `Un territoire prend la distance de son échantillon le plus proche.</div></div>`
  );
  rows.push(
    `<div class="src-item"><b>Datation et localisation</b>` +
      `<div class="hint">Déduites de l’étiquette de chaque échantillon et du territoire auquel il est rattaché. ` +
      `Une date issue d’un mot-clé (« LBA », « Early Medieval ») est indicative et calée sur la chronologie européenne ; ` +
      `le point d’un échantillon est le centre de son territoire, pas son lieu de fouille.</div></div>`
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
 * Les jeux ne sont pas chargés d'avance : les anciens pèsent près de 2 Mo, et
 * tout charger au démarrage coûterait plusieurs secondes pour des données que
 * l'utilisateur ne consultera peut-être jamais. On ne récupère donc que le jeu
 * sélectionné, et on garde en mémoire ceux déjà vus.
 */
async function selectDataset(id, { keepTarget = true } = {}) {
  const spec = state.datasets.find((d) => d.id === id);
  if (!spec) return;

  const sel = $("dataset");
  sel.disabled = true;
  $("datasetHint").textContent = "Chargement…";
  $("datasetHint").classList.add("busy");

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

    // Les filtres temporels du jeu précédent n'ont aucun sens ici : les bornes
    // d'un jeu médiéval ne recouvrent pas celles d'un jeu néolithique.
    FILTERS.yMin = FILTERS.yMax = null;
    FILTERS.periods = null;
    resetCoverage();

    state.map.attributionControl.removeAttribution(state.attribution);
    state.attribution = attributionText();
    state.map.attributionControl.addAttribution(state.attribution);

    renderSources();
    populateCountrySelect();
    renderExamples();
    renderTimeline();
    renderPeriodChips();

    // Le modèle d'admixture porte sur l'ancien jeu : il ne veut plus rien dire.
    state.admix = null;
    $("admixResult").innerHTML = `<p class="hint">Relancez le calcul sur ce jeu.</p>`;

    // Toutes les cartes ne survivent pas au changement de jeu : « Gaulois »
    // ne documente aucun département, « Âge du Fer Europe » aucune région.
    const moved = ensureUsableMap();
    renderTabs();
    describeDataset(spec);
    if (moved) toast(`« ${moved.from} » n’est pas couvert par ce jeu — passage à « ${moved.to} ».`);

    if (keepTarget && state.target) recompute();
    else {
      paintMap();
      renderTable();
    }
    syncPermalink();
  } catch (e) {
    toast("Chargement impossible : " + (e && e.message ? e.message : e));
    $("datasetHint").textContent = "Échec du chargement.";
  } finally {
    sel.disabled = false;
    $("datasetHint").classList.remove("busy");
  }
}

function describeDataset(spec) {
  const pct = spec.count ? Math.round((100 * spec.tagged) / spec.count) : 0;
  const usable = state.catalog.maps.filter((m) => mapIsUsable(coverageFor(m.id)));
  const bits = [`${spec.count.toLocaleString("fr-FR")} échantillons`, `${pct} % localisables`];
  if (spec.dated) bits.push(`${Math.round((100 * spec.dated) / spec.count)} % datés`);
  const scope = usable.length
    ? `Cartes exploitables : ${usable.map((m) => m.title).join(", ")}.`
    : "Aucune carte n’est assez couverte ; la table des distances reste utilisable.";
  $("datasetHint").textContent = `${bits.join(" · ")}. ${scope}`;
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
