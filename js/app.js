function analyze() {
  const parsed = parseG25($("targetInput").value);
  if (!parsed.length) {
    toast("Collez une ligne G25 (nom + 25 nombres).");
    return;
  }
  state.target = parsed[0];
  const samples = allSamples();
  const distances = samples.map((s) => ({
    n: s.n,
    d: euclid(state.target.c, s.c),
    iso3: s.iso3,
    role: s.role,
    custom: !!s.custom,
  }));
  distances.sort((a, b) => a.d - b.d);
  state.distances = distances;
  $("statN").textContent = String(samples.length);
  $("statBest").textContent = distances[0] ? distances[0].n : "—";
  $("statBestD").textContent = distances[0] ? formatDist(distances[0].d) : "—";
  $("targetName").textContent = state.target.n;
  paintMap();
  renderTable();
  try {
    localStorage.setItem("g25-last-target", $("targetInput").value);
  } catch (_) {}
}

function fillExample(name) {
  const s = state.samples.find((x) => x.n === name);
  if (!s) return;
  $("targetInput").value = `${s.n},${s.c.join(",")}`;
  analyze();
}

function assetUrl(rel) {
  const path = location.pathname.replace(/index\.html$/i, "");
  const base = path.endsWith("/") ? path : `${path}/`;
  return `${base}${String(rel).replace(/^\//, "")}`;
}

async function loadJson(url) {
  const res = await fetch(assetUrl(url));
  if (!res.ok) throw new Error(`Impossible de charger ${url} (${res.status})`);
  return res.json();
}

async function loadDepositsFile() {
  try {
    const data = await loadJson("data/deposits.json");
    const arr = Array.isArray(data) ? data : data.deposits || [];
    state.fileDeposits = arr.filter((d) => d?.n && Array.isArray(d.c) && d.c.length === 25);
  } catch (_) {
    state.fileDeposits = [];
  }
}

function populateCountrySelect() {
  const sel = $("depIso");
  const names = new Map();
  const world = state.geo.world;
  if (world) {
    for (const f of world.features) names.set(f.properties.iso3, f.properties.name);
  }
  const opts = ['<option value="">— pays —</option>'];
  [...names.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "fr"))
    .forEach(([iso, name]) => {
      opts.push(`<option value="${iso}">${name} (${iso})</option>`);
    });
  sel.innerHTML = opts.join("");

  const reg = $("depRegion");
  reg.innerHTML =
    '<option value="">— région FR —</option>' +
    FR_REGIONS.map((r) => `<option value="${r.code}">${r.nom}</option>`).join("");
}
