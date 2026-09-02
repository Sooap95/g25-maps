/** Parse G25 lines and compute 25-D Euclidean distances. */

const G25_DIMS = 25;

function parseG25(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !/^,?PC\d/i.test(l));

  const out = [];
  for (const line of lines) {
    const parsed = parseG25Line(line);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseG25Line(line) {
  const comma = line.includes(",");
  const parts = (comma ? line.split(",") : line.split(/\s+/)).map((s) => s.trim()).filter(Boolean);
  if (parts.length < G25_DIMS) return null;

  let name = "Target";
  let numParts = parts;
  const firstNum = Number(parts[0]);
  if (parts.length >= G25_DIMS + 1 && !Number.isFinite(firstNum)) {
    name = parts[0];
    numParts = parts.slice(1);
  } else if (parts.length === G25_DIMS + 1 && Number.isFinite(firstNum)) {
    numParts = parts.slice(0, G25_DIMS);
  }

  const coords = numParts.slice(0, G25_DIMS).map(Number);
  if (coords.length !== G25_DIMS || coords.some((n) => !Number.isFinite(n))) return null;
  return { n: name, c: coords };
}

function euclid(a, b) {
  let s = 0;
  for (let i = 0; i < G25_DIMS; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

function formatDist(d) {
  if (d == null || Number.isNaN(d)) return "—";
  return d.toFixed(6);
}

const PALETTES = {
  "vert-rouge": ["#1a9850", "#91cf60", "#d9ef8b", "#fee08b", "#fc8d59", "#d73027"],
  "jaune-rouge": ["#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"],
  magma: ["#fcfdbf", "#fe9f6d", "#de4968", "#8c2981", "#3b0f70", "#000004"],
  viridis: ["#fde725", "#7ad151", "#22a884", "#2a788e", "#414487", "#440154"],
  ocean: ["#c7e9b4", "#7fcdbb", "#41b6c4", "#1d91c0", "#225ea8", "#0c2c84"],
  gris: ["#ffffff", "#d9d9d9", "#969696", "#525252", "#252525"],
};

// Palettes divergentes : elles ne servent qu'au mode comparaison, ou la valeur
// affichee est un ecart signe. Le centre doit rester neutre, sinon « aucune
// difference » se lirait comme un resultat.
const PALETTES_DIV = {
  "bleu-rouge": ["#2166ac", "#67a9cf", "#d1e5f0", "#f7f7f7", "#fddbc7", "#ef8a62", "#b2182b"],
  "violet-vert": ["#762a83", "#af8dc3", "#e7d4e8", "#f7f7f7", "#d9f0d3", "#7fbf7b", "#1b7837"],
};

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function colorAt(stops, t) {
  const x = Math.min(1, Math.max(0, t));
  if (stops.length === 1) return stops[0];
  const scaled = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  const r = Math.round(lerp(a[0], b[0], f));
  const g = Math.round(lerp(a[1], b[1], f));
  const bl = Math.round(lerp(a[2], b[2], f));
  return `rgb(${r},${g},${bl})`;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return s[lo];
  return s[lo] * (hi - i) + s[hi] * (i - lo);
}

/**
 * Rang d'une distance dans une distribution deja triee, entre 0 et 1.
 *
 * C'est ce qui rend « 0,032 » lisible : seul, ce nombre ne dit rien, alors que
 * « plus proche que 96 % des populations du jeu » se comprend sans reference.
 */
function percentRank(sortedAsc, value) {
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return sortedAsc.length ? lo / sortedAsc.length : 0;
}

/**
 * Territoires que Natural Earth sépare en polygones distincts alors qu'aucune
 * population de référence ne leur est propre : ils empruntent celle du
 * territoire dont ils sont génétiquement indissociables.
 *
 * C'est un repli documenté, pas une donnée : le nom de l'échantillon reste
 * affiché au survol, donc « Kosovo → Albanian » se lit tel quel.
 */
const ISO_FALLBACK = {
  CYN: "CYP", // Chypre du Nord : même île, même population de référence
  PRK: "KOR", // Corée du Nord : aucun échantillon distinct publié
  SOL: "SOM", // Somaliland
  KOS: "ALB", // Kosovo, très majoritairement albanophone
};

/**
 * Échantillons qu'un territoire peut légitimement revendiquer, et à quel titre.
 *
 * Trois provenances possibles, volontairement distinguées :
 *  - `specific` : l'échantillon est rattaché à ce territoire précis
 *    (département, région, NUTS, ou pays sur une carte de pays) ;
 *  - `alias`    : substitution documentée entre territoires génétiquement
 *    indissociables (voir ISO_FALLBACK) ;
 *  - `national` : le territoire n'a rien à lui et emprunte les échantillons de
 *    son pays. Toutes les subdivisions du pays prennent alors la même valeur —
 *    celle de son meilleur échantillon —, si bien qu'une région sans donnée
 *    apparaît aussi proche que la mieux documentée, voire plus. C'est une carte
 *    lisse et fausse : ce repli est donc optionnel, et signalé quand il sert.
 */
function samplesForFeature(feat, samples, { national = false } = {}) {
  const p = feat.properties || {};

  const specific = samples.filter((s) => matchSpecific(p, s));
  if (specific.length) return { pack: specific, source: "specific" };

  const alias = ISO_FALLBACK[p.iso3];
  if (alias) {
    const sub = samples.filter((s) => s.iso3 === alias);
    if (sub.length) return { pack: sub, source: "alias" };
  }

  if (!national || p.kind === "country" || !p.iso3) return { pack: [], source: "none" };
  const pack = samples.filter((s) => s.iso3 === p.iso3);
  return pack.length ? { pack, source: "national" } : { pack: [], source: "none" };
}

function matchSpecific(p, s) {
  if (p.kind === "dept" && Array.isArray(s.fr_depts) && s.fr_depts.includes(p.insee)) return true;
  if (p.kind === "region" && Array.isArray(s.fr_regions) && s.fr_regions.includes(p.insee)) return true;
  if (p.nuts && Array.isArray(s.nuts) && s.nuts.includes(p.nuts)) return true;
  if (p.kind === "country" && s.iso3 && s.iso3 === p.iso3) return true;
  return false;
}

/**
 * Ce qu'une carte peut réellement montrer d'un jeu de données donné.
 *
 * `distinct` est la mesure qui compte : le nombre de couleurs différentes que
 * la carte est capable de produire. C'est lui qui trahit l'aplat uniforme —
 * les 96 départements français peints d'une seule teinte parce que le jeu
 * « Gaulois » n'en documente aucun — là où `specific` seul ne dirait rien.
 */
function mapCoverage(geo, samples) {
  let specific = 0;
  let approx = 0;
  const packs = new Set();
  for (const feat of geo.features) {
    const { pack, source } = samplesForFeature(feat, samples, { national: true });
    if (!pack.length) continue;
    if (source === "national") {
      approx++;
    } else {
      specific++;
      packs.add(pack.map((s) => s.n).join(""));
    }
  }
  return { features: geo.features.length, specific, approx, distinct: packs.size };
}

// Seuils d'affichage d'une carte. En dessous, elle « marche » toujours mais ne
// dit plus rien : trop peu de territoires renseignés, ou trop peu de valeurs
// distinctes pour qu'un dégradé se lise.
const MAP_MIN_SPECIFIC = 5;
const MAP_MIN_DISTINCT = 3;

function mapIsUsable(cov) {
  return cov.specific >= MAP_MIN_SPECIFIC && cov.distinct >= MAP_MIN_DISTINCT;
}
