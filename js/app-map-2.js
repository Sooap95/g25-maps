function paintMap() {
  if (state.layer) {
    state.map.removeLayer(state.layer);
    state.layer = null;
  }
  const spec = state.catalog.maps.find((m) => m.id === state.currentMap);
  const geo = state.geo[state.currentMap];
  if (!geo) return;

  const diaspora = $("includeDiaspora").checked;
  const national = !!$("nationalFallback")?.checked;
  const samples = allSamples();
  const target = state.target;
  const dists = [];

  for (const feat of geo.features) {
    feat.__pack = [];
    feat.__dist = null;
    feat.__bestSample = null;
    feat.__approx = false;
    if (target) {
      const { pack, source } = samplesForFeature(feat, samples, { diaspora, national });
      feat.__pack = pack;
      feat.__approx = source === "national";
      if (pack.length) {
        let best = Infinity;
        let bestSample = null;
        for (const s of pack) {
          const d = euclid(target.c, s.c);
          if (d < best) {
            best = d;
            bestSample = s;
          }
        }
        feat.__dist = best;
        feat.__bestSample = bestSample;
        dists.push({ d: best, approx: feat.__approx });
      }
    }
  }

  // L'échelle se règle sur les seuls territoires réellement documentés. Une
  // valeur empruntée au pays est identique pour toutes ses subdivisions :
  // la laisser fixer le minimum étirerait le dégradé autour d'un chiffre qui
  // ne décrit aucun de ces territoires en particulier.
  const measured = dists.filter((x) => !x.approx).map((x) => x.d);
  const base = measured.length ? measured : dists.map((x) => x.d);

  // « Selon la carte » délègue au catalogue : rang là où la distribution est
  // bimodale (le Monde, où l'écart Europe↔Afrique écrase tout), continue sur
  // les cartes régionales où l'étendue est étroite et l'écart réel lisible.
  const picked = $("rangeMode").value;
  const mode = picked === "smart" ? spec?.scale || "auto" : picked;
  if (target && base.length) {
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

  // Position de chaque territoire dans la palette.
  // « Par rang » égalise les effectifs entre bandes de couleur : indispensable
  // sur la carte Monde, où l'écart Europe↔Afrique subsaharienne écrase sinon
  // toute nuance intra-européenne dans une seule teinte.
  if (mode === "rank") {
    const sorted = [...base].sort((a, b) => a - b);
    const span = Math.max(1, sorted.length - 1);
    for (const feat of geo.features) {
      // Rang obtenu par comparaison plutôt que par table de correspondance :
      // une distance empruntée au pays n'appartient pas à `base` et doit
      // malgré tout trouver sa place dans le dégradé.
      feat.__t =
        feat.__dist == null
          ? null
          : Math.min(1, sorted.filter((d) => d < feat.__dist).length / span);
    }
  } else {
    const span = Math.max(1e-9, state.range.max - state.range.min);
    for (const feat of geo.features) {
      feat.__t =
        feat.__dist == null
          ? null
          : Math.min(1, Math.max(0, (feat.__dist - state.range.min) / span));
    }
  }
  state.rankMode = mode === "rank";
  updateLegendBar();

  state.layer = L.geoJSON(geo, {
    style: (feat) => styleFeature(feat),
    onEachFeature: (feat, layer) => {
      const name = feat.properties.name;
      layer.on("mouseover", () => {
        layer.setStyle({ weight: 2, color: "#f0c27a" });
        $("hoverName").textContent = name;
        $("hoverDist").textContent =
          feat.__dist == null
            ? "pas d’échantillon"
            : formatDist(feat.__dist) + (feat.__approx ? " (nationale)" : "");
        $("hoverSample").textContent = feat.__bestSample
          ? feat.__bestSample.n + (feat.__approx ? " — moyenne du pays" : "")
          : "—";
      });
      layer.on("mouseout", () => layer.setStyle(styleFeature(feat)));
      layer.on("click", () => {
        if (!state.target) {
          layer.bindPopup(`<b>${name}</b><div class="hint">Collez un G25 puis Analysez.</div>`).openPopup();
          return;
        }
        layer.bindPopup(popupHtml(name, feat.__pack, feat.__dist, feat.__approx)).openPopup();
      });
    },
  }).addTo(state.map);

  updateMapNote(diaspora);
  fitMap(spec);
}

/**
 * Bandeau au-dessus de la carte quand elle ne tient pas sa promesse : mieux
 * vaut annoncer les trous que laisser lire un aplat comme un résultat.
 */
function updateMapNote(diaspora) {
  const note = $("mapNote");
  if (!note) return;
  const cov = coverageFor(state.currentMap, diaspora);
  const spec = state.catalog.maps.find((m) => m.id === state.currentMap);

  if (!mapIsUsable(cov)) {
    note.hidden = false;
    note.className = "map-note warn";
    note.textContent =
      `« ${spec?.title || state.currentMap} » n’est pas exploitable avec ce jeu de données : ` +
      `${cov.specific} territoire(s) documenté(s) sur ${cov.features}. Choisissez une carte proposée ci-dessus.`;
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
    `${cov.specific} / ${cov.features} territoires documentés par ce jeu` +
    ($("nationalFallback")?.checked
      ? ` · ${cov.approx} estimés depuis la moyenne de leur pays (hachurés).`
      : ` · les autres restent gris, faute d’échantillon.`);
}

/** Couverture d'une carte, mise en cache : elle ne dépend pas du profil cible. */
function coverageFor(mapId, diaspora) {
  const key = `${state.currentDataset || "base"}|${mapId}|${diaspora ? 1 : 0}`;
  if (!state.coverage[key]) {
    state.coverage[key] = mapCoverage(state.geo[mapId], allSamples(), { diaspora });
  }
  return state.coverage[key];
}

function resetCoverage() {
  state.coverage = {};
}

/**
 * Après un changement de jeu de données, la carte affichée peut n'avoir plus
 * rien à montrer. On bascule alors sur la première qui le peut.
 */
function ensureUsableMap() {
  const diaspora = $("includeDiaspora").checked;
  if (mapIsUsable(coverageFor(state.currentMap, diaspora))) return null;
  // La mieux couverte, et non la première du catalogue : le jeu « Gaulois »
  // passe le seuil sur l'Europe de l'Ouest avec 6 territoires sur 103, alors
  // que la carte des régions françaises en montre 6 sur 13.
  const next = state.catalog.maps
    .filter((m) => mapIsUsable(coverageFor(m.id, diaspora)))
    .sort((a, b) => {
      const ca = coverageFor(a.id, diaspora);
      const cb = coverageFor(b.id, diaspora);
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
  const diaspora = $("includeDiaspora").checked;
  for (const m of state.catalog.maps) {
    const cov = coverageFor(m.id, diaspora);
    const ok = mapIsUsable(cov);
    const b = document.createElement("button");
    b.textContent = m.title;
    b.className = m.id === state.currentMap ? "active" : "";
    if (!ok) b.classList.add("unavailable");
    // La carte courante reste cliquable même devenue inexploitable : sinon
    // l'onglet actif serait le seul sur lequel on ne pourrait pas revenir.
    b.disabled = !ok && m.id !== state.currentMap;
    b.title = ok
      ? `${cov.specific} / ${cov.features} territoires documentés par ce jeu.`
      : `Indisponible avec ce jeu : ${cov.specific} territoire(s) documenté(s) sur ${cov.features}. La carte serait un aplat.`;
    b.onclick = () => {
      state.currentMap = m.id;
      renderTabs();
      paintMap();
      // En mode « selon la carte », changer de carte peut changer d'échelle :
      // les pastilles du tableau doivent suivre.
      renderTable();
    };
    box.appendChild(b);
  }
}

function renderTable() {
  const q = $("tableSearch").value.trim().toLowerCase();
  const body = $("tableBody");
  body.innerHTML = "";
  if (!state.distances) {
    body.innerHTML = `<tr><td colspan="5">Analysez un profil pour voir les distances.</td></tr>`;
    return;
  }
  // Rang global, figé avant tout filtrage : une recherche ne doit pas
  // recolorer les pastilles restantes.
  state.distances.forEach((r, i) => (r.__i = i));
  let rows = state.distances;
  if (q) rows = rows.filter((r) => r.n.toLowerCase().includes(q) || (r.iso3 || "").toLowerCase().includes(q));
  const max = 400;
  const span = Math.max(1e-9, state.range.max - state.range.min);
  const rankSpan = Math.max(1, state.distances.length - 1);
  for (const r of rows.slice(0, max)) {
    const tr = document.createElement("tr");
    // La pastille suit le mode d'échelle actif, pour que tableau et carte
    // racontent la même histoire.
    const t = state.rankMode
      ? r.__i / rankSpan
      : Math.min(1, Math.max(0, (r.d - state.range.min) / span));
    const color = colorAt(paletteStops(), t);
    tr.innerHTML = `
      <td><span class="dot" style="background:${color}"></span>${escapeHtml(r.n)}
        ${r.custom ? '<span class="badge custom">dépôt</span>' : ""}</td>
      <td class="mono">${formatDist(r.d)}</td>
      <td>${r.iso3 || "—"}</td>
      <td>${r.role || ""}</td>
      <td class="src-cell">${escapeHtml(r.src || "—")}</td>`;
    body.appendChild(tr);
  }
  $("tableCount").textContent = `${Math.min(rows.length, max)} / ${state.distances.length}`;
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
