const state = {
  catalog: null,
  samples: [],
  deposits: [],
  fileDeposits: [],
  geo: {},
  currentMap: "europe",
  target: null,
  compare: null,
  distances: null,
  sortedDistances: null, // distances triées du vivier, pour les rangs
  layer: null,
  interp: null,
  map: null,
  range: { min: 0, max: 0.1 },
  sources: [],
  dims: 25,
  rankMode: false,
  diffMode: false,
  admix: null,
  datasets: [],
  datasetCache: {},
  currentDataset: null,
  attribution: "",
  sort: { key: "d", dir: 1 },
  ready: false,
  // Couverture (jeu de données × carte), calculée à la demande et mémorisée :
  // elle ne dépend pas du profil analysé, seulement du vivier chargé.
  coverage: {},
};

const FR_REGIONS = [
  { code: "11", nom: "Île-de-France" },
  { code: "24", nom: "Centre-Val de Loire" },
  { code: "27", nom: "Bourgogne-Franche-Comté" },
  { code: "28", nom: "Normandie" },
  { code: "32", nom: "Hauts-de-France" },
  { code: "44", nom: "Grand Est" },
  { code: "52", nom: "Pays de la Loire" },
  { code: "53", nom: "Bretagne" },
  { code: "75", nom: "Nouvelle-Aquitaine" },
  { code: "76", nom: "Occitanie" },
  { code: "84", nom: "Auvergne-Rhône-Alpes" },
  { code: "93", nom: "Provence-Alpes-Côte d'Azur" },
  { code: "94", nom: "Corse" },
];

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.style.display = "none";
  }, 3600);
}

function allSamples() {
  return [
    ...state.samples,
    ...state.deposits.map(depositToSample),
    ...state.fileDeposits.map(depositToSample),
  ];
}

/** Palette active : divergente en comparaison, séquentielle sinon. */
function paletteStops() {
  if (state.diffMode) return PALETTES_DIV["bleu-rouge"];
  return PALETTES[$("palette").value] || PALETTES["vert-rouge"];
}

function updateLegendBar() {
  const stops = paletteStops();
  $("legendBar").style.background = `linear-gradient(90deg, ${stops.join(",")})`;
  if (state.diffMode) {
    $("legMin").textContent = "A plus proche";
    $("legMax").textContent = "B plus proche";
  } else {
    $("legMin").textContent = state.range.min.toFixed(4);
    $("legMax").textContent = state.range.max.toFixed(4);
  }

  const note = $("legendNote");
  if (note) {
    note.textContent = state.diffMode
      ? "Le blanc central marque l’égalité : les deux profils y sont aussi proches l’un que l’autre."
      : state.rankMode
        ? "Couleur = rang, pas distance. Les écarts absolus ne sont plus lisibles sur la carte ; la distance exacte reste au survol."
        : "Couleur = distance réelle. Deux territoires de teinte voisine sont réellement à distance voisine.";
  }
  const hint = $("rangeHint");
  if (hint) {
    hint.textContent =
      $("rangeMode").value === "smart"
        ? `Choisi pour cette carte : ${state.rankMode ? "rang" : "distance continue"}.`
        : "";
  }
}

function fitMap(spec) {
  if (!spec?.view) return;
  const [[s, w], [n, e]] = spec.view;
  state.map.fitBounds(
    [
      [s, w],
      [n, e],
    ],
    { padding: [12, 12], animate: false }
  );
}

/** « plus proche que 96 % des populations » — un rang parle, un flottant non. */
function readDistance(d) {
  if (d == null || !state.sortedDistances?.length) return "—";
  const rank = percentRank(state.sortedDistances, d);
  const closer = Math.round((1 - rank) * 100);
  if (closer >= 99) return "plus proche que 99 % des populations";
  if (closer <= 1) return "parmi les plus éloignées du jeu";
  return `plus proche que ${closer} % des populations`;
}

/**
 * Lecture absolue de la meilleure distance.
 *
 * Le rang répond « par rapport aux autres » ; il vaut toujours 100 % pour le
 * plus proche et ne dit donc rien de lui. Ces paliers sont ceux couramment
 * employés sur des coordonnées G25 scaled — indicatifs, comme tout le reste.
 */
function qualifyDistance(d) {
  if (d == null) return "—";
  if (d < 0.005) return "profil déjà dans le jeu";
  if (d < 0.02) return "très proche";
  if (d < 0.04) return "proche";
  if (d < 0.08) return "correspondance modérée";
  if (d < 0.15) return "éloignée";
  return "très éloignée — mauvais jeu de référence ?";
}

function shortRank(d) {
  if (d == null || !state.sortedDistances?.length) return "—";
  return `${Math.round((1 - percentRank(state.sortedDistances, d)) * 100)} %`;
}

function popupHtml(name, pack, dist, approx = false) {
  if (!pack.length) {
    return `<b>${escapeHtml(name)}</b><div class="hint">Aucun échantillon rattaché à ce territoire dans le jeu sélectionné.</div>`;
  }
  const rows = pack
    .map((s) => ({ s, d: euclid(state.target.c, s.c) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6)
    .map(({ s, d }) => {
      const tag = s.custom ? ' <span class="badge custom">dépôt</span>' : "";
      const when = s.y != null ? ` <span class="hint">${formatYear(s.y)}</span>` : "";
      return `<div>${escapeHtml(s.n)}${tag}${when} <span class="mono">${formatDist(d)}</span></div>`;
    })
    .join("");
  const src = sourceLabel(pack[0]);
  const credit = src ? `<div class="hint src-credit">source&nbsp;: ${escapeHtml(src)}</div>` : "";
  const warn = approx
    ? `<div class="hint warn-text">Aucun échantillon propre à ce territoire : valeur empruntée à la moyenne du pays, identique pour toutes ses subdivisions.</div>`
    : "";
  const head = state.diffMode
    ? `<div class="hint">écart A−B ${formatDist(dist)}</div>`
    : `<div class="hint">distance ${formatDist(dist)} — ${readDistance(dist)}</div>`;
  return `<b>${escapeHtml(name)}</b>${head}${warn}${rows}${credit}`;
}

function styleFeature(feat) {
  if (feat.__dist == null) {
    return {
      color: "#3a4652",
      weight: 0.7,
      dashArray: null,
      fillColor: "#1b232b",
      fillOpacity: 0.85,
    };
  }
  // La surface interpolée porte déjà la couleur : les polygones ne gardent que
  // leurs contours, sinon les deux lectures se superposeraient illisiblement.
  if (state.interpOn) {
    return { color: "#0c0f12", weight: 0.6, dashArray: null, fillOpacity: 0 };
  }
  // Un territoire qui emprunte la moyenne de son pays est dessiné en retrait —
  // même teinte, mais délavée et bordée de pointillés — pour qu'on ne le lise
  // pas comme une mesure locale.
  if (feat.__approx) {
    return {
      color: "#5b6774",
      weight: 0.7,
      dashArray: "3 3",
      fillColor: colorAt(paletteStops(), feat.__t ?? 0),
      fillOpacity: 0.35,
    };
  }
  // __t est calculé dans paintMap : linéaire pour auto/pct/manual, rang sinon.
  return {
    color: "#0c0f12",
    weight: 0.8,
    dashArray: null,
    fillColor: colorAt(paletteStops(), feat.__t ?? 0),
    fillOpacity: 0.92,
  };
}
