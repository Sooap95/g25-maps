function paintMap() {
  if (state.layer) {
    state.map.removeLayer(state.layer);
    state.layer = null;
  }
  const spec = state.catalog.maps.find((m) => m.id === state.currentMap);
  const geo = state.geo[state.currentMap];
  if (!geo) return;

  const national = !!$("nationalFallback")?.checked;
  const samples = pool();
  const target = state.target;
  state.diffMode = !!(target && state.compare);
  state.interpOn = !!$("showInterp")?.checked && !!target;
  const values = [];

  for (const feat of geo.features) {
    feat.__pack = [];
    feat.__dist = null;
    feat.__bestSample = null;
    feat.__approx = false;
    if (target) {
      const { pack, source } = samplesForFeature(feat, samples, { national });
      feat.__pack = pack;
      feat.__approx = source === "national";
      if (pack.length) {
        const best = closestOf(pack, target.c);
        feat.__bestSample = best.s;
        // En comparaison, la valeur affichée est l'écart signé entre les deux
        // profils : négatif là où A est le plus proche, positif là où c'est B.
        feat.__dist = state.diffMode ? best.d - closestOf(pack, state.compare.c).d : best.d;
        values.push({ v: feat.__dist, approx: feat.__approx });
      }
    }
  }

  computeRamp(spec, values);
  paintFeatures(geo);
  updateInterpolation(geo, samples);

  state.layer = L.geoJSON(geo, {
    style: (feat) => styleFeature(feat),
    onEachFeature: (feat, layer) => {
      const show = () => showFeatureInfo(feat);
      layer.on("mouseover", () => {
        layer.setStyle({ weight: 2, color: "#f0c27a" });
        show();
      });
      layer.on("mouseout", () => layer.setStyle(styleFeature(feat)));
      layer.on("click", () => {
        // Sur écran tactile il n'y a pas de survol : le tap doit remplir le
        // panneau latéral en plus d'ouvrir la bulle.
        show();
        if (!state.target) {
          layer.bindPopup(`<b>${feat.properties.name}</b><div class="hint">Collez un profil G25 puis Analysez.</div>`).openPopup();
          return;
        }
        layer.bindPopup(popupHtml(feat.properties.name, feat.__pack, feat.__dist, feat.__approx)).openPopup();
      });
    },
  }).addTo(state.map);

  updateMapNote();
  fitMap(spec);
}

/** Échantillon le plus proche d'un vecteur, dans un paquet donné. */
function closestOf(pack, coords) {
  let best = Infinity;
  let s = null;
  for (const cand of pack) {
    const d = euclid(coords, cand.c);
    if (d < best) {
      best = d;
      s = cand;
    }
  }
  return { s, d: best };
}

/**
 * Bornes du dégradé.
 *
 * L'échelle se règle sur les seuls territoires réellement documentés : une
 * valeur empruntée au pays est identique pour toutes ses subdivisions, et la
 * laisser fixer le minimum étirerait le dégradé autour d'un chiffre qui ne
 * décrit aucun de ces territoires en particulier.
 */
function computeRamp(spec, values) {
  const measured = values.filter((x) => !x.approx).map((x) => x.v);
  const base = measured.length ? measured : values.map((x) => x.v);
  state.rampBase = base;

  if (state.diffMode) {
    // Écart signé : l'échelle doit être symétrique, sinon le blanc central ne
    // tombe plus sur l'égalité et la carte penche visuellement d'un côté.
    const m = Math.max(1e-9, ...base.map(Math.abs));
    state.range.min = -m;
    state.range.max = m;
    state.rankMode = false;
    updateLegendBar();
    return;
  }

  const picked = $("rangeMode").value;
  // « Selon la carte » délègue au catalogue : rang là où la distribution est
  // bimodale (le Monde, où l'écart Europe↔Afrique écrase tout), continue sur
  // les cartes régionales où l'étendue est étroite et l'écart réel lisible.
  const mode = picked === "smart" ? spec?.scale || "auto" : picked;
  if (state.target && base.length) {
    if (mode === "auto" || mode === "rank") {
      state.range.min = Math.min(...base);
      state.range.max = Math.max(...base);
    } else if (mode === "pct") {
      state.range.min = percentile(base, 0.02);
      state.range.max = percentile(base, 0.98);
    } else {
      state.range.min = Number($("rangeMin").value) || 0;
      state.range.max = Number($("rangeMax").value) || 0.15;
    }
    $("rangeMin").value = state.range.min.toFixed(4);
    $("rangeMax").value = state.range.max.toFixed(4);
  }
  state.rankMode = mode === "rank";
  updateLegendBar();
}

/** Position de chaque territoire dans la palette, entre 0 et 1. */
function paintFeatures(geo) {
  if (state.rankMode) {
    // « Par rang » égalise les effectifs entre bandes de couleur : indispensable
    // sur la carte Monde, où l'écart Europe↔Afrique subsaharienne écrase sinon
    // toute nuance intra-européenne dans une seule teinte.
    const sorted = [...state.rampBase].sort((a, b) => a - b);
    const span = Math.max(1, sorted.length - 1);
    for (const feat of geo.features) {
      // Rang obtenu par comparaison plutôt que par table de correspondance :
      // une distance empruntée au pays n'appartient pas à la base et doit
      // malgré tout trouver sa place dans le dégradé.
      feat.__t =
        feat.__dist == null
          ? null
          : Math.min(1, sorted.filter((d) => d < feat.__dist).length / span);
    }
    return;
  }
  const span = Math.max(1e-9, state.range.max - state.range.min);
  for (const feat of geo.features) {
    feat.__t =
      feat.__dist == null
        ? null
        : Math.min(1, Math.max(0, (feat.__dist - state.range.min) / span));
  }
}

function showFeatureInfo(feat) {
  $("hoverName").textContent = feat.properties.name;
  $("hoverDist").textContent =
    feat.__dist == null
      ? "aucun échantillon"
      : formatDist(feat.__dist) + (feat.__approx ? " (nationale)" : "");
  $("hoverSample").textContent = feat.__bestSample
    ? feat.__bestSample.n + (feat.__approx ? " — moyenne du pays" : "")
    : "—";
}

/** Surface interpolée : construite à la demande, retirée dès qu'on la décoche. */
function updateInterpolation(geo, samples) {
  if (!state.interpOn) {
    if (state.interp) {
      state.map.removeLayer(state.interp);
      state.interp = null;
    }
    return;
  }
  if (!state.interp) {
    state.interp = new InterpolationLayer({
      paint: (v) => {
        const span = Math.max(1e-9, state.range.max - state.range.min);
        const t = Math.min(1, Math.max(0, (v - state.range.min) / span));
        const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(colorAt(paletteStops(), t));
        return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
      },
    });
    state.map.addLayer(state.interp);
  }
  const pts = [];
  for (const s of samples) {
    if (s.lat == null || s.lon == null) continue;
    const d = euclid(state.target.c, s.c);
    const v = state.diffMode ? d - euclid(state.compare.c, s.c) : d;
    pts.push({ lat: s.lat, lon: s.lon, d: v });
  }
  const n = state.interp.setData(pts, geo);
  if (!n) toast("Aucun échantillon localisé : la surface ne peut pas être calculée.");
}

/**
 * Bandeau au-dessus de la carte quand elle ne tient pas sa promesse : mieux
 * vaut annoncer les trous que laisser lire un aplat comme un résultat.
 */
function updateMapNote() {
  const note = $("mapNote");
  if (!note) return;
  const cov = coverageFor(state.currentMap);
  const spec = state.catalog.maps.find((m) => m.id === state.currentMap);

  if (!mapIsUsable(cov)) {
    note.hidden = false;
    note.className = "map-note warn";
    note.textContent =
      `« ${spec?.title || state.currentMap} » n’est pas exploitable avec ce vivier : ` +
      `${cov.specific} territoire(s) documenté(s) sur ${cov.features}. Choisissez une carte proposée ci-dessus, ` +
      `ou élargissez vos filtres.`;
    return;
  }

  const holes = cov.features - cov.specific;
  if (!holes || !state.target) {
    note.hidden = true;
    return;
  }
  note.hidden = false;
  note.className = "map-note";
  note.textContent =
    `${cov.specific} / ${cov.features} territoires documentés` +
    ($("nationalFallback")?.checked
      ? ` · ${cov.approx} estimés depuis la moyenne de leur pays (hachurés).`
      : ` · les autres restent gris, faute d’échantillon.`);
}

/**
 * Couverture d'une carte, mise en cache : elle ne dépend pas du profil cible,
 * seulement du vivier — donc du jeu chargé, des dépôts et des filtres.
 */
function coverageFor(mapId) {
  const key = `${state.currentDataset || "base"}|${mapId}|${state.poolKey}`;
  if (!state.coverage[key]) {
    state.coverage[key] = mapCoverage(state.geo[mapId], pool());
  }
  return state.coverage[key];
}

function resetCoverage() {
  state.coverage = {};
  // Signature du vivier : tout ce qui peut changer sa composition.
  state.poolKey = [
    FILTERS.diaspora,
    FILTERS.yMin,
    FILTERS.yMax,
    FILTERS.periods ? [...FILTERS.periods].sort().join(",") : "*",
    FILTERS.minK,
    FILTERS.noLowRes,
    FILTERS.noOutlier,
    state.deposits.length,
    state.fileDeposits.length,
  ].join("|");
}

/**
 * Après un changement de jeu ou de filtre, la carte affichée peut n'avoir plus
 * rien à montrer. On bascule alors sur celle qui la remplace le mieux.
 */
function ensureUsableMap() {
  if (mapIsUsable(coverageFor(state.currentMap))) return null;
  // La mieux couverte, et non la première du catalogue : le jeu « Gaulois »
  // passe le seuil sur l'Europe de l'Ouest avec 6 territoires sur 103, alors
  // que la carte des régions françaises en montre 6 sur 13.
  const next = state.catalog.maps
    .filter((m) => mapIsUsable(coverageFor(m.id)))
    .sort((a, b) => {
      const ca = coverageFor(a.id);
      const cb = coverageFor(b.id);
      return cb.specific / cb.features - ca.specific / ca.features;
    })[0];
  if (!next || next.id === state.currentMap) return null;
  const from = state.catalog.maps.find((m) => m.id === state.currentMap);
  state.currentMap = next.id;
  return { from: from?.title || "", to: next.title };
}

function renderTabs() {
  const box = $("mapTabs");
  box.innerHTML = "";
  for (const m of state.catalog.maps) {
    const cov = coverageFor(m.id);
    const ok = mapIsUsable(cov);
    const b = document.createElement("button");
    b.textContent = m.title;
    b.className = m.id === state.currentMap ? "active" : "";
    if (!ok) b.classList.add("unavailable");
    // La carte courante reste cliquable même devenue inexploitable : sinon
    // l'onglet actif serait le seul sur lequel on ne pourrait pas revenir.
    b.disabled = !ok && m.id !== state.currentMap;
    b.title = ok
      ? `${cov.specific} / ${cov.features} territoires documentés par ce vivier.`
      : `Indisponible avec ce vivier : ${cov.specific} territoire(s) documenté(s) sur ${cov.features}. La carte serait un aplat.`;
    b.onclick = () => {
      state.currentMap = m.id;
      renderTabs();
      paintMap();
      // En mode « selon la carte », changer de carte peut changer d'échelle :
      // les pastilles du tableau doivent suivre.
      renderTable();
      syncPermalink();
    };
    box.appendChild(b);
  }
}

const TABLE_MAX = 400;

function renderTable() {
  const q = $("tableSearch").value.trim().toLowerCase();
  const body = $("tableBody");
  body.innerHTML = "";
  if (!state.distances) {
    body.innerHTML = `<tr><td colspan="6">Analysez un profil pour voir les distances.</td></tr>`;
    $("tableCount").textContent = "";
    return;
  }

  let rows = state.distances;
  if (q) rows = rows.filter((r) => r.n.toLowerCase().includes(q) || (r.iso3 || "").toLowerCase().includes(q));

  const { key, dir } = state.sort;
  rows = [...rows].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // les valeurs absentes finissent toujours en bas
    if (vb == null) return -1;
    return (typeof va === "string" ? va.localeCompare(vb, "fr") : va - vb) * dir;
  });

  const span = Math.max(1e-9, state.range.max - state.range.min);
  const shown = rows.slice(0, TABLE_MAX);
  const frag = document.createDocumentFragment();
  for (const r of shown) {
    const tr = document.createElement("tr");
    // La pastille suit toujours la distance brute, même quand la carte est en
    // mode écart : le tableau, lui, reste une liste de proximités.
    const t = Math.min(1, Math.max(0, (r.d - state.range.min) / span));
    const color = colorAt(state.diffMode ? PALETTES[$("palette").value] : paletteStops(), t);
    tr.innerHTML = `
      <td><span class="dot" style="background:${color}"></span>${escapeHtml(r.n)}
        ${r.custom ? '<span class="badge custom">dépôt</span>' : ""}</td>
      <td class="mono">${formatDist(r.d)}</td>
      <td class="mono">${r.pct == null ? "—" : Math.round(r.pct) + " %"}</td>
      <td>${r.y == null ? "—" : escapeHtml(formatYear(r.y))}</td>
      <td>${r.iso3 || "—"}</td>
      <td class="src-cell">${escapeHtml(r.src || "—")}</td>`;
    tr.onclick = () => locateSample(r);
    tr.title = "Centrer la carte sur cet échantillon";
    frag.appendChild(tr);
  }
  body.appendChild(frag);

  const hidden = rows.length - shown.length;
  $("tableCount").textContent = hidden
    ? `${shown.length} affichés sur ${rows.length} — affinez le filtre pour voir les suivants`
    : `${rows.length} / ${state.distances.length}`;
}

/** Clic sur une ligne : la carte va voir de quoi il s'agit. */
function locateSample(row) {
  if (row.lat == null || row.lon == null) {
    toast(`« ${row.n} » n’est rattaché à aucun territoire.`);
    return;
  }
  state.map.setView([row.lat, row.lon], Math.max(state.map.getZoom(), 5), { animate: true });
  L.popup()
    .setLatLng([row.lat, row.lon])
    .setContent(
      `<b>${escapeHtml(row.n)}</b><div class="hint">distance ${formatDist(row.d)} — ${escapeHtml(readDistance(row.d))}</div>` +
        (row.y != null ? `<div class="hint">${escapeHtml(formatYear(row.y))}</div>` : "")
    )
    .openOn(state.map);
}

function renderSortHeaders() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.sort === state.sort.key) {
      th.classList.add(state.sort.dir > 0 ? "sorted-asc" : "sorted-desc");
    }
    th.onclick = () => {
      const key = th.dataset.sort;
      // Un second clic sur la même colonne inverse le sens ; changer de colonne
      // repart du croissant, sauf pour le rang où « le meilleur » est le plus haut.
      if (state.sort.key === key) state.sort.dir *= -1;
      else state.sort = { key, dir: key === "pct" ? -1 : 1 };
      renderSortHeaders();
      renderTable();
    };
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}
