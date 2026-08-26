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
    $("statCustom").textContent = String(state.deposits.length + state.fileDeposits.length);
    toast(`${recs.length} source(s) importée(s).`);
    if (state.target) analyze();
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

async function init() {
  state.map = L.map("map", {
    zoomControl: true,
    attributionControl: false,
    worldCopyJump: false,
  });
  L.control.attribution({ prefix: false }).addTo(state.map);
  state.map.attributionControl.addAttribution("G25 Eurogenes · Natural Earth · IGN/Etalab · Eurostat NUTS");

  const [catalog, sampleData] = await Promise.all([
    loadJson("data/maps/catalog.json"),
    loadJson("data/samples.json"),
  ]);
  state.catalog = catalog;
  state.samples = sampleData.samples;
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

  populateCountrySelect();
  renderTabs();
  renderDepositList();
  paintMap();

  $("statN").textContent = String(allSamples().length);
  $("statCustom").textContent = String(state.deposits.length + state.fileDeposits.length);

  $("btnAnalyze").onclick = analyze;
  $("targetInput").addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") analyze();
  });
  $("btnReset").onclick = () => {
    state.target = null;
    state.distances = null;
    $("targetName").textContent = "—";
    $("statBest").textContent = "—";
    $("statBestD").textContent = "—";
    paintMap();
    renderTable();
  };
  $("palette").onchange = () => {
    if (state.target) paintMap();
    else updateLegendBar();
    renderTable();
  };
  $("rangeMode").onchange = () => {
    const manual = $("rangeMode").value === "manual";
    $("rangeMin").disabled = !manual;
    $("rangeMax").disabled = !manual;
    if (state.target) paintMap();
  };
  $("rangeMin").onchange = $("rangeMax").onchange = () => {
    if ($("rangeMode").value === "manual" && state.target) paintMap();
  };
  $("includeDiaspora").onchange = () => {
    if (state.target) analyze();
  };
  $("tableSearch").oninput = renderTable;
  $("btnPng").onclick = downloadPng;

  document.querySelectorAll("[data-example]").forEach((el) => {
    el.onclick = () => fillExample(el.dataset.example);
  });

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
    $("statCustom").textContent = String(state.fileDeposits.length);
    if (state.target) analyze();
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

  try {
    const last = localStorage.getItem("g25-last-target");
    if (last) $("targetInput").value = last;
  } catch (_) {}

  updateLegendBar();
  renderTable();
}

init().catch((err) => {
  console.error(err);
  toast("Erreur de chargement des cartes : " + (err && err.message ? err.message : err));
});
