/**
 * État de la page dans l'URL.
 *
 * Un résultat qu'on ne peut pas envoyer à quelqu'un n'existe qu'une fois. Tout
 * tient dans le fragment (`#…`), jamais dans la requête : le profil est une
 * donnée génétique, et un fragment n'est pas transmis au serveur — GitHub Pages
 * ne le voit pas, ne le journalise pas.
 */

const LINK_KEYS = {
  d: "dataset",
  m: "map",
  p: "palette",
  s: "scale",
  t: "target",
  b: "compare",
  y: "years",
  k: "minK",
  f: "flags", // n(ational) l(owres) o(utlier) d(iaspora) i(nterpolation)
};

/** Base64 compatible URL : le « + / = » standard casse les fragments. */
function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64decode(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(s + "===".slice((s.length + 3) % 4))));
}

/** Un profil se réduit à son nom et ses 25 nombres, arrondis au millionième. */
function encodeProfile(p) {
  if (!p) return null;
  return b64encode(`${p.n},${p.c.map((x) => Number(x).toFixed(6)).join(",")}`);
}

function decodeProfile(raw) {
  try {
    return parseG25Line(b64decode(raw));
  } catch (_) {
    return null;
  }
}

function currentLinkState() {
  const flags =
    ($("nationalFallback").checked ? "n" : "") +
    ($("fltLowRes").checked ? "l" : "") +
    ($("fltOutlier").checked ? "o" : "") +
    ($("includeDiaspora").checked ? "d" : "") +
    ($("showInterp").checked ? "i" : "");
  const st = {
    d: state.currentDataset,
    m: state.currentMap,
    p: $("palette").value,
    s: $("rangeMode").value,
    t: encodeProfile(state.target),
    b: encodeProfile(state.compare),
    k: FILTERS.minK > 1 ? String(FILTERS.minK) : null,
    y: FILTERS.yMin != null || FILTERS.yMax != null ? `${FILTERS.yMin ?? ""}:${FILTERS.yMax ?? ""}` : null,
    f: flags || null,
  };
  return Object.entries(st).filter(([, v]) => v);
}

function buildPermalink() {
  const q = currentLinkState()
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `${location.origin}${location.pathname}#${q}`;
}

function readPermalink() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return null;
  const out = {};
  for (const part of hash.split("&")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Réécrit le fragment sans empiler d'entrées d'historique : sinon un simple
 * déplacement de la frise obligerait à trente retours arrière pour sortir.
 */
function syncPermalink() {
  if (!state.ready) return;
  const q = currentLinkState()
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  history.replaceState(null, "", q ? `#${q}` : location.pathname);
}

async function copyPermalink() {
  const url = buildPermalink();
  try {
    await navigator.clipboard.writeText(url);
    toast("Lien copié — il contient le profil analysé.");
  } catch (_) {
    // Le presse-papiers est refusé hors contexte sécurisé : on montre l'URL
    // plutôt que d'échouer en silence.
    prompt("Copiez ce lien :", url);
  }
}
