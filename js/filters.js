/**
 * Tri du vivier d'échantillons, en un seul endroit.
 *
 * La carte, la table, le modèle d'admixture et le calcul de couverture doivent
 * tous voir exactement le même sous-ensemble : si l'utilisateur écarte les
 * profils à faible couverture, un modèle qui continuerait de les utiliser
 * contredirait la carte sans le dire. D'où ce point de passage unique.
 */

const FILTERS = {
  diaspora: false,
  yMin: null,
  yMax: null,
  periods: null, // Set de codes, ou null = toutes
  minK: 1,
  minCov: 0,
  noLowRes: false,
  noOutlier: false,
};

/** Un échantillon passe-t-il les filtres actifs ? */
function passesFilters(s) {
  if (!FILTERS.diaspora && s.role === "diaspora") return false;
  if (FILTERS.noLowRes && s.lo) return false;
  if (FILTERS.noOutlier && s.ol) return false;
  if (FILTERS.minK > 1 && (s.k || 1) < FILTERS.minK) return false;
  if (FILTERS.minCov > 0 && s.cov != null && s.cov < FILTERS.minCov) return false;

  // Les dépôts personnels n'ont pas de date et traversent toujours le filtre
  // temporel : les écarter ferait disparaître ce que l'on vient d'ajouter dès
  // qu'on touche à la frise.
  if (s.custom) return true;

  const timeFilter = FILTERS.yMin != null || FILTERS.yMax != null;
  if (s.y == null) {
    // Un échantillon de la base sans date n'a rien à faire dans une fenêtre
    // temporelle choisie : sinon un Campaniforme non daté resterait visible en
    // plein Mésolithique et rendrait la frise trompeuse.
    return !timeFilter && !FILTERS.periods;
  }
  if (FILTERS.yMin != null && s.y < FILTERS.yMin) return false;
  if (FILTERS.yMax != null && s.y > FILTERS.yMax) return false;
  if (FILTERS.periods && s.p && !FILTERS.periods.has(s.p)) return false;
  return true;
}

/** Vivier effectif : base du jeu courant + dépôts, filtré. */
function pool() {
  return allSamples().filter(passesFilters);
}

/** Ce que les filtres retirent, pour l'afficher sans avoir à le deviner. */
function filterSummary() {
  const total = allSamples().length;
  const kept = pool().length;
  return { total, kept, dropped: total - kept };
}

/**
 * Étendue temporelle du jeu courant, arrondie au siècle.
 * Sert à borner la frise : la caler sur -45000 à cause de trois échantillons
 * paléolithiques rendrait le reste du curseur inutilisable.
 */
function datasetYearRange(samples) {
  const years = samples.map((s) => s.y).filter((y) => y != null).sort((a, b) => a - b);
  if (!years.length) return null;
  // 2e et 98e percentiles : quelques valeurs extrêmes ne doivent pas écraser
  // la partie de la frise où vivent réellement les données.
  const lo = years[Math.floor(years.length * 0.02)];
  const hi = years[Math.min(years.length - 1, Math.ceil(years.length * 0.98))];
  return {
    min: Math.floor(lo / 100) * 100,
    max: Math.ceil(hi / 100) * 100,
    trueMin: years[0],
    trueMax: years[years.length - 1],
    count: years.length,
  };
}

/** « 340 av. J.-C. », « 1066 apr. J.-C. » — l'année signée reste illisible. */
function formatYear(y) {
  if (y == null) return "—";
  const n = Math.abs(Math.round(y));
  return y < 0 ? `${n} av. J.-C.` : `${n} apr. J.-C.`;
}

const PERIOD_LABELS = [
  ["paleo", "Paléolithique"],
  ["meso", "Mésolithique"],
  ["neo", "Néolithique"],
  ["chalco", "Chalcolithique"],
  ["bronze", "Âge du Bronze"],
  ["iron", "Âge du Fer"],
  ["antiq", "Antiquité"],
  ["migr", "Migrations"],
  ["medieval", "Moyen Âge"],
  ["modern", "Époque moderne"],
];

const PERIOD_NAME = Object.fromEntries(PERIOD_LABELS);
