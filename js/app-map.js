const state = {
  catalog: null,
  samples: [],
  deposits: [],
  fileDeposits: [],
  geo: {},
  currentMap: "europe",
  target: null,
  distances: null,
  layer: null,
  map: null,
  range: { min: 0, max: 0.1 },
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
  }, 2800);
}

function allSamples() {
  return [
    ...state.samples,
    ...state.deposits.map(depositToSample),
    ...state.fileDeposits.map(depositToSample),
  ];
}

function paletteStops() {
  return PALETTES[$("palette").value] || PALETTES["vert-rouge"];
}

function updateLegendBar() {
  const stops = paletteStops();
  $("legendBar").style.background = `linear-gradient(90deg, ${stops.join(",")})`;
  $("legMin").textContent = state.range.min.toFixed(4);
  $("legMax").textContent = state.range.max.toFixed(4);
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

function popupHtml(name, pack, dist) {
  const rows = pack
    .slice(0, 6)
    .map((s) => {
      const d = euclid(state.target.c, s.c);
      const tag = s.custom ? ' <span class="badge custom">dépôt</span>' : "";
      return `<div>${s.n}${tag} <span class="mono">${formatDist(d)}</span></div>`;
    })
    .join("");
  return `<b>${name}</b><div class="hint">distance ${formatDist(dist)}</div>${rows}`;
}

function styleFeature(feat) {
  const dist = feat.__dist;
  if (dist == null) {
    return {
      color: "#3a4652",
      weight: 0.7,
      fillColor: "#1b232b",
      fillOpacity: 0.85,
    };
  }
  const t = (dist - state.range.min) / Math.max(1e-9, state.range.max - state.range.min);
  return {
    color: "#0c0f12",
    weight: 0.8,
    fillColor: colorAt(paletteStops(), t),
    fillOpacity: 0.92,
  };
}
