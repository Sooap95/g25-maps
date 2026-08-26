function paintMap() {
  if (state.layer) {
    state.map.removeLayer(state.layer);
    state.layer = null;
  }
  const spec = state.catalog.maps.find((m) => m.id === state.currentMap);
  const geo = state.geo[state.currentMap];
  if (!geo) return;

  const diaspora = $("includeDiaspora").checked;
  const samples = allSamples();
  const target = state.target;
  const dists = [];

  for (const feat of geo.features) {
    feat.__pack = [];
    feat.__dist = null;
    if (target) {
      const pack = samplesForFeature(feat, samples, { diaspora });
      feat.__pack = pack;
      if (pack.length) {
        let best = Infinity;
        for (const s of pack) {
          const d = euclid(target.c, s.c);
          if (d < best) best = d;
        }
        feat.__dist = best;
        dists.push(best);
      }
    }
  }

  if (target && dists.length) {
    const mode = $("rangeMode").value;
    if (mode === "auto") {
      state.range.min = Math.min(...dists);
      state.range.max = Math.max(...dists);
    } else if (mode === "pct") {
      state.range.min = percentile(dists, 0.02);
      state.range.max = percentile(dists, 0.98);
    } else {
      state.range.min = Number($("rangeMin").value) || 0;
      state.range.max = Number($("rangeMax").value) || 0.15;
    }
    $("rangeMin").value = state.range.min.toFixed(4);
    $("rangeMax").value = state.range.max.toFixed(4);
  }
  updateLegendBar();

  state.layer = L.geoJSON(geo, {
    style: (feat) => styleFeature(feat),
    onEachFeature: (feat, layer) => {
      const name = feat.properties.name;
      layer.on("mouseover", () => {
        layer.setStyle({ weight: 2, color: "#f0c27a" });
        $("hoverName").textContent = name;
        $("hoverDist").textContent = feat.__dist == null ? "pas d’échantillon" : formatDist(feat.__dist);
        if (feat.__pack?.[0]) $("hoverSample").textContent = feat.__pack[0].n;
        else $("hoverSample").textContent = "—";
      });
      layer.on("mouseout", () => layer.setStyle(styleFeature(feat)));
      layer.on("click", () => {
        if (!state.target) {
          layer.bindPopup(`<b>${name}</b><div class="hint">Collez un G25 puis Analysez.</div>`).openPopup();
          return;
        }
        layer.bindPopup(popupHtml(name, feat.__pack, feat.__dist)).openPopup();
      });
    },
  }).addTo(state.map);

  fitMap(spec);
}

function renderTabs() {
  const box = $("mapTabs");
  box.innerHTML = "";
  for (const m of state.catalog.maps) {
    const b = document.createElement("button");
    b.textContent = m.title;
    b.className = m.id === state.currentMap ? "active" : "";
    b.onclick = () => {
      state.currentMap = m.id;
      renderTabs();
      paintMap();
    };
    box.appendChild(b);
  }
}

function renderTable() {
  const q = $("tableSearch").value.trim().toLowerCase();
  const body = $("tableBody");
  body.innerHTML = "";
  if (!state.distances) {
    body.innerHTML = `<tr><td colspan="4">Analysez un profil pour voir les distances.</td></tr>`;
    return;
  }
  let rows = state.distances;
  if (q) rows = rows.filter((r) => r.n.toLowerCase().includes(q) || (r.iso3 || "").toLowerCase().includes(q));
  const max = 400;
  for (const r of rows.slice(0, max)) {
    const tr = document.createElement("tr");
    const t = (r.d - state.range.min) / Math.max(1e-9, state.range.max - state.range.min);
    const color = colorAt(paletteStops(), Math.min(1, Math.max(0, t)));
    tr.innerHTML = `
      <td><span class="dot" style="background:${color}"></span>${escapeHtml(r.n)}
        ${r.custom ? '<span class="badge custom">dépôt</span>' : ""}</td>
      <td class="mono">${formatDist(r.d)}</td>
      <td>${r.iso3 || "—"}</td>
      <td>${r.role || ""}</td>`;
    body.appendChild(tr);
  }
  $("tableCount").textContent = `${Math.min(rows.length, max)} / ${state.distances.length}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&",
    "<": "<",
    ">": ">",
    '"': """,
    "'": "&#39;",
  })[c]);
}
