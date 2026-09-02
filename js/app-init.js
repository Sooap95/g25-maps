async function importDepositFile(file) {
  const text = await file.text();
  if (file.name.endsWith(".json")) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      toast("JSON invalide.");
      return;
    }
    const arr = Array.isArray(data) ? data : data.deposits || parseG25(text);
    const recs = [];
    for (const item of arr) {
      if (item?.n && Array.isArray(item.c) && item.c.length === 25) {
        recs.push({
          id: item.id || newDepositId(),
          n: item.n,
          c: item.c,
          iso3: item.iso3 || null,
          role: item.role || "regional",
          fr_regions: item.fr_regions || [],
          fr_depts: item.fr_depts || [],
          nuts: item.nuts || [],
          notes: item.notes || "",
          created: item.created || Date.now(),
        });
      }
    }
    if (!recs.length) {
      toast("Pas de sources dans ce JSON.");
      return;
    }
    await saveDeposits(recs);
    state.deposits = await listDeposits();
    renderDepositList();
    refreshPool({ message: `${recs.length} source(s) importée(s).` });
    return;
  }
  await addDepositsFromText(text);
}

async function downloadPng() {
  if (typeof html2canvas !== "function") {
    toast("html2canvas introuvable.");
    return;
  }
  const node = $("map");
  const canvas = await html2canvas(node, { backgroundColor: "#0a0d10", useCORS: true, logging: false });
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `g25-${state.currentMap}.png`;
  a.click();
}

/** Applique un état reçu par l'URL. Toute valeur absente garde son défaut. */
async function applyLinkState(link) {
  if (link.d && state.datasets.some((x) => x.id === link.d) && link.d !== state.currentDataset) {
    $("dataset").value = link.d;
    await selectDataset(link.d, { keepTarget: false });
  }
  if (link.p) $("palette").value = link.p;
  if (link.s) $("rangeMode").value = link.s;

  const flags = link.f || "";
  $("nationalFallback").checked = flags.includes("n");
  $("fltLowRes").checked = flags.includes("l");
  $("fltOutlier").checked = flags.includes("o");
  $("includeDiaspora").checked = flags.includes("d");
  $("showInterp").checked = flags.includes("i");
  FILTERS.diaspora = $("includeDiaspora").checked;
  FILTERS.noLowRes = $("fltLowRes").checked;
  FILTERS.noOutlier = $("fltOutlier").checked;

  if (link.k) {
    FILTERS.minK = Number(link.k) || 1;
    $("fltMinK").value = FILTERS.minK;
    $("fltMinKVal").textContent = FILTERS.minK;
  }
  if (link.y) {
    const [a, b] = link.y.split(":");
    FILTERS.yMin = a === "" ? null : Number(a);
    FILTERS.yMax = b === "" ? null : Number(b);
    renderTimeline();
  }
  resetCoverage();

  if (link.t) {
    const t = decodeProfile(link.t);
    if (t) {
      state.target = t;
      $("targetInput").value = `${t.n},${t.c.join(",")}`;
    }
  }
  if (link.b) {
    const b = decodeProfile(link.b);
    if (b) {
      state.compare = b;
      $("compareInput").value = `${b.n},${b.c.join(",")}`;
      $("compareName").textContent = b.n;
    }
  }
  if (link.m && state.catalog.maps.some((m) => m.id === link.m)) state.currentMap = link.m;
}

async function init() {
  state.map = L.map("map", {
    zoomControl: true,
    attributionControl: false,
    worldCopyJump: false,
  });
  // Vue de départ indispensable : sans zoom courant, getBoundsZoom() rend null,
  // fitBounds() pose alors un centre NaN et la carte reste noire — les trois
  // « Invalid LatLng (NaN, NaN) » que la console affichait au chargement.
  // Le cadrage réel est ensuite posé par fitMap().
  state.map.setView([48, 8], 4);
  L.control.attribution({ prefix: false }).addTo(state.map);

  const [catalog, sampleData, dsIndex] = await Promise.all([
    loadJson("data/maps/catalog.json"),
    loadJson("data/samples.json"),
    // L'inventaire est optionnel : sans lui l'app retombe sur samples.json seul,
    // ce qui garde une version deployee avant les jeux multiples fonctionnelle.
    loadJson("data/datasets/index.json").catch(() => null),
  ]);
  state.catalog = catalog;
  state.samples = sampleData.samples;
  state.sources = normalizeSources(sampleData.sources || sampleData.source);
  state.dims = sampleData.dims || 25;
  state.attribution = attributionText();
  state.map.attributionControl.addAttribution(state.attribution);

  state.datasets = dsIndex?.datasets || [];
  const def = state.datasets.find((d) => d.default) || state.datasets[0];
  if (def) {
    state.currentDataset = def.id;
    state.datasetCache[def.id] = sampleData;
  }
  await Promise.all(
    catalog.maps.map(async (m) => {
      state.geo[m.id] = await loadJson(m.file);
    })
  );
  await loadDepositsFile();
  try {
    state.deposits = await listDeposits();
  } catch (e) {
    console.warn(e);
    state.deposits = [];
  }

  resetCoverage();
  populateCountrySelect();
  renderSources();
  renderExamples();
  renderTimeline();
  renderPeriodChips();
  if (state.datasets.length) {
    renderDatasetSelect();
    $("dataset").onchange = () => selectDataset($("dataset").value);
  } else {
    $("dataset").closest("label, div, section")?.querySelector("#dataset")?.remove?.();
  }

  wireControls();

  const link = readPermalink();
  if (link) await applyLinkState(link);

  ensureUsableMap();
  renderTabs();
  if (state.datasets.length) describeDataset(state.datasets.find((d) => d.id === state.currentDataset));
  renderDepositList();
  renderSortHeaders();
  updateFilterHint();
  $("statCustom").textContent = String(state.deposits.length + state.fileDeposits.length);

  if (state.target) recompute();
  else {
    paintMap();
    renderTable();
    // Le profil de la session précédente est proposé, pas rejoué : l'analyse
    // reste un geste volontaire.
    try {
      const last = localStorage.getItem("g25-last-target");
      if (last && !$("targetInput").value) $("targetInput").value = last;
    } catch (_) {}
  }

  updateLegendBar();
  state.ready = true;
  $("appLoading").hidden = true;
}

function wireControls() {
  $("btnAnalyze").onclick = analyze;
  $("targetInput").addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") analyze();
  });
  $("btnReset").onclick = () => {
    state.target = null;
    state.compare = null;
    state.distances = null;
    $("targetInput").value = "";
    $("compareInput").value = "";
    for (const id of ["targetName", "statBest", "statBestD", "statPct", "compareName"]) {
      $(id).textContent = "—";
    }
    paintMap();
    renderTable();
    syncPermalink();
  };

  $("btnCompare").onclick = () => setCompare($("compareInput").value);
  $("btnCompareClear").onclick = clearCompare;
  $("btnShare").onclick = copyPermalink;

  $("palette").onchange = () => {
    if (state.target) paintMap();
    else updateLegendBar();
    renderTable();
    syncPermalink();
  };
  $("rangeMode").onchange = () => {
    const manual = $("rangeMode").value === "manual";
    $("rangeMin").disabled = !manual;
    $("rangeMax").disabled = !manual;
    if (state.target) paintMap();
    else updateLegendBar();
    renderTable();
    syncPermalink();
  };
  $("rangeMin").onchange = $("rangeMax").onchange = () => {
    if ($("rangeMode").value === "manual" && state.target) paintMap();
  };

  $("showInterp").onchange = () => {
    if (!state.target) {
      toast("Analysez un profil : la surface se calcule à partir de ses distances.");
      $("showInterp").checked = false;
      return;
    }
    paintMap();
    syncPermalink();
  };
  $("nationalFallback").onchange = () => {
    if (state.target) paintMap();
    updateMapNote();
    syncPermalink();
  };

  const filterToggle = (id, key) => {
    $(id).onchange = () => {
      FILTERS[key] = $(id).checked;
      refreshPool();
    };
  };
  filterToggle("includeDiaspora", "diaspora");
  filterToggle("fltLowRes", "noLowRes");
  filterToggle("fltOutlier", "noOutlier");

  $("fltMinK").oninput = () => {
    $("fltMinKVal").textContent = $("fltMinK").value;
  };
  $("fltMinK").onchange = () => {
    FILTERS.minK = Number($("fltMinK").value) || 1;
    refreshPool();
  };

  $("tlMin").oninput = $("tlMax").oninput = updateTimelineLabels;
  $("tlMin").onchange = $("tlMax").onchange = () => {
    stopTimeline();
    applyTimeline();
  };
  $("tlReset").onclick = resetTimeline;
  $("tlPlay").onclick = toggleTimeline;

  $("tableSearch").oninput = renderTable;
  $("btnPng").onclick = downloadPng;
  $("btnAdmix").onclick = runAdmixture;
  $("btnAdmixCopy").onclick = copyAdmix;
  $("admixK").onchange = () => {
    if (state.admix) runAdmixture();
  };

  $("btnAddDeposit").onclick = () =>
    addDepositsFromText($("depositInput").value, {
      iso3: $("depIso").value || null,
      region: $("depRegion").value || null,
      dept: $("depDept").value.trim() || null,
      nuts: $("depNuts").value.trim() || null,
      notes: $("depNotes").value.trim() || "",
      role: $("depRole").value,
    });
  $("btnExportJson").onclick = exportDeposits;
  $("btnExportTxt").onclick = exportG25Txt;
  $("btnClearDeposits").onclick = async () => {
    if (!confirm("Effacer tous les dépôts du navigateur ?")) return;
    await clearDeposits();
    state.deposits = [];
    renderDepositList();
    refreshPool();
  };
  $("fileImport").onchange = (e) => {
    const f = e.target.files?.[0];
    if (f) importDepositFile(f);
    e.target.value = "";
  };

  const drop = $("dropZone");
  drop.addEventListener("click", () => $("fileImport").click());
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const f = e.dataTransfer.files?.[0];
    if (f) importDepositFile(f);
  });

  // La carte occupe une hauteur relative : sans ça elle garde la taille
  // qu'elle avait au chargement quand on tourne un téléphone.
  window.addEventListener("resize", () => state.map?.invalidateSize());
}

init().catch((err) => {
  console.error(err);
  $("appLoading").innerHTML = `<p class="warn-text">Erreur de chargement : ${err && err.message ? err.message : err}</p>`;
});
