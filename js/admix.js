/**
 * Modélisation d'admixture : décompose un profil cible en proportions de
 * populations sources.
 *
 * Complémentaire de la carte, qui ne répond qu'à « de quelle moyenne suis-je le
 * plus proche ». Ici on répond à « de quoi suis-je composé », ce qui est la
 * bonne question dès qu'un profil est un mélange — et tous le sont.
 *
 * Problème : minimiser ‖cible − Σ wᵢ·sourceᵢ‖ sous wᵢ ≥ 0 et Σwᵢ = 1.
 * C'est un quadratique convexe sur le simplexe : il admet une solution exacte,
 * inutile de tirer au sort comme le fait nMonte. On résout par descente de
 * gradient projetée, puis on choisit les sources par sélection avant gloutonne.
 */

/** Projection euclidienne sur le simplexe (Duchi et al., 2008). */
function projectSimplex(v) {
  const n = v.length;
  const u = [...v].sort((a, b) => b - a);
  let css = 0;
  let theta = 0;
  for (let i = 0; i < n; i++) {
    css += u[i];
    const t = (css - 1) / (i + 1);
    if (u[i] - t > 0) theta = t;
  }
  return v.map((x) => Math.max(0, x - theta));
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Poids optimaux pour un jeu de sources figé.
 * f(w) = wᵀGw − 2bᵀw + cte, avec G la matrice de Gram des sources et b leurs
 * produits scalaires avec la cible. Pas fixé par la borne de Gershgorin.
 */
function fitWeights(target, srcs, iters = 3000) {
  const k = srcs.length;
  if (k === 1) return [1];
  const G = [];
  for (let i = 0; i < k; i++) {
    G.push(new Array(k));
    for (let j = 0; j < k; j++) G[i][j] = dot(srcs[i], srcs[j]);
  }
  return fitWeightsG(G, srcs.map((s) => dot(s, target)), iters);
}

/**
 * Cœur du solveur, travaillant directement sur la matrice de Gram `G` des
 * sources et leurs produits scalaires `b` avec la cible.
 *
 * Séparé de fitWeights parce que la sélection gloutonne réévalue un millier de
 * candidats par tour : recalculer les produits scalaires à chaque essai coûtait
 * plusieurs secondes, alors qu'ils se déduisent d'un cache.
 */
function fitWeightsG(G, b, iters = 3000) {
  const k = b.length;
  if (k === 1) return [1];

  let L = 0;
  for (let i = 0; i < k; i++) {
    let row = 0;
    for (let j = 0; j < k; j++) row += Math.abs(G[i][j]);
    L = Math.max(L, row);
  }
  const step = 1 / (2 * Math.max(L, 1e-12));

  // FISTA. Les moyennes de populations voisines sont très corrélées, donc G est
  // presque singulière ; une descente simple y converge beaucoup trop lentement
  // et rend des poids visiblement faux.
  let w = new Array(k).fill(1 / k);
  let y = w.slice();
  let t = 1;
  for (let it = 0; it < iters; it++) {
    const grad = new Array(k);
    for (let i = 0; i < k; i++) {
      let gy = 0;
      for (let j = 0; j < k; j++) gy += G[i][j] * y[j];
      grad[i] = 2 * (gy - b[i]);
    }
    const next = projectSimplex(y.map((x, i) => x - step * grad[i]));
    const tNext = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
    const mom = (t - 1) / tNext;
    y = next.map((x, i) => x + mom * (x - w[i]));
    let move = 0;
    for (let i = 0; i < k; i++) move += Math.abs(next[i] - w[i]);
    w = next;
    t = tNext;
    if (move < 1e-12) break;
  }
  return w;
}

/** Distance résiduelle entre la cible et le mélange reconstitué. */
function fitError(target, srcs, w) {
  const dims = target.length;
  let s = 0;
  for (let d = 0; d < dims; d++) {
    let v = 0;
    for (let i = 0; i < srcs.length; i++) v += w[i] * srcs[i][d];
    const e = target[d] - v;
    s += e * e;
  }
  return Math.sqrt(s);
}

/** Même résidu, obtenu depuis la forme quadratique : ‖t‖² − 2bᵀw + wᵀGw. */
function fitErrorG(G, b, w, tt) {
  const k = w.length;
  let s = tt;
  for (let i = 0; i < k; i++) {
    s -= 2 * b[i] * w[i];
    for (let j = 0; j < k; j++) s += w[i] * w[j] * G[i][j];
  }
  return Math.sqrt(Math.max(0, s));
}

/**
 * Sélection avant gloutonne : on ajoute à chaque tour la source qui réduit le
 * plus le résidu, puis on réajuste tous les poids.
 *
 * Un ajustement libre sur 1000 sources produirait un modèle illisible, truffé
 * de poids à 0,4 % qui ne font qu'épouser le bruit. Contraindre le nombre de
 * sources est ce qui rend le résultat interprétable.
 */
function greedyModel(target, pool, k) {
  const n = pool.length;
  const tt = dot(target, target);
  // Caches : produits scalaires cible↔candidat, self↔self, et sélectionné↔candidat.
  const bt = new Float64Array(n);
  const selfDot = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    bt[i] = dot(pool[i].c, target);
    selfDot[i] = dot(pool[i].c, pool[i].c);
  }
  const crossRows = []; // crossRows[s][i] = dot(sélectionné s, candidat i)

  const chosen = [];
  const taken = new Uint8Array(n);
  let Gsel = [];
  let bsel = [];
  let weights = [];
  let err = Infinity;

  for (let step = 0; step < k; step++) {
    const m = chosen.length;
    let best = null;

    // Présélection à faible précision : il suffit de classer les candidats,
    // pas de connaître leurs poids au millième. L'ajustement fin vient après.
    const G = Array.from({ length: m + 1 }, () => new Array(m + 1).fill(0));
    for (let a = 0; a < m; a++)
      for (let b2 = 0; b2 < m; b2++) G[a][b2] = Gsel[a][b2];
    const b = new Array(m + 1);
    for (let a = 0; a < m; a++) b[a] = bsel[a];

    for (let i = 0; i < n; i++) {
      if (taken[i]) continue;
      for (let a = 0; a < m; a++) {
        const v = crossRows[a][i];
        G[a][m] = v;
        G[m][a] = v;
      }
      G[m][m] = selfDot[i];
      b[m] = bt[i];
      const w = fitWeightsG(G, b, 150);
      const e = fitErrorG(G, b, w, tt);
      if (!best || e < best.e) best = { i, e };
    }
    if (!best) break;

    // Ajustement fin sur le jeu retenu.
    const i = best.i;
    for (let a = 0; a < m; a++) {
      const v = crossRows[a][i];
      G[a][m] = v;
      G[m][a] = v;
    }
    G[m][m] = selfDot[i];
    b[m] = bt[i];
    const w = fitWeightsG(G, b, 3000);
    const e = fitErrorG(G, b, w, tt);
    if (e >= err - 1e-9) break;

    chosen.push(i);
    taken[i] = 1;
    Gsel = G.map((row) => row.slice());
    bsel = b.slice();
    weights = w;
    err = e;

    const row = new Float64Array(n);
    for (let j = 0; j < n; j++) row[j] = dot(pool[i].c, pool[j].c);
    crossRows.push(row);
  }

  const parts = chosen
    .map((idx, j) => ({ sample: pool[idx], w: weights[j] }))
    .filter((p) => p.w > 0.0005)
    .sort((a, b) => b.w - a.w);

  // Les sources tombées à zéro sont retirées : on renormalise pour que le
  // total affiché fasse bien 100 %.
  const total = parts.reduce((s, p) => s + p.w, 0) || 1;
  parts.forEach((p) => (p.w /= total));

  return { parts, error: err };
}

/**
 * Pool de candidats : exactement le vivier que montre la carte.
 *
 * Un modèle bâti sur des échantillons que l'utilisateur vient d'écarter —
 * profils bruités, périodes décochées — contredirait la carte sans le dire.
 */
function admixPool() {
  return pool();
}

function runAdmixture() {
  if (!state.target) {
    toast("Analysez d'abord un profil.");
    return;
  }
  const k = Number($("admixK").value) || 4;
  const pool = admixPool();
  if (pool.length < k) {
    toast("Pas assez de sources disponibles.");
    return;
  }

  const btn = $("btnAdmix");
  btn.disabled = true;
  btn.textContent = "Calcul…";

  // Rendu différé d'une frame pour que le bouton s'affiche avant le calcul,
  // qui bloque le thread principal.
  setTimeout(() => {
    const t0 = performance.now();
    const model = greedyModel(state.target.c, pool, k);
    const ms = Math.round(performance.now() - t0);
    state.admix = model;
    renderAdmix(model, ms);
    btn.disabled = false;
    btn.textContent = "Calculer le modèle";
  }, 20);
}

function renderAdmix(model, ms) {
  const box = $("admixResult");
  if (!model || !model.parts.length) {
    box.innerHTML = `<div class="hint">Aucun modèle.</div>`;
    return;
  }
  const stops = paletteStops();
  const rows = model.parts
    .map((p, i) => {
      const pct = (p.w * 100).toFixed(1);
      const color = colorAt(stops, model.parts.length === 1 ? 0 : i / (model.parts.length - 1));
      const tag = p.sample.custom ? ' <span class="badge custom">dépôt</span>' : "";
      return `<div class="admix-row">
        <div class="admix-head">
          <span><span class="dot" style="background:${color}"></span>${escapeHtml(p.sample.n)}${tag}</span>
          <b class="mono">${pct}&nbsp;%</b>
        </div>
        <div class="admix-bar"><i style="width:${pct}%;background:${color}"></i></div>
      </div>`;
    })
    .join("");

  // Le résidu se lit à la même échelle que les distances de la table :
  // en dessous de ~0.02, le modèle rend bien compte de la cible.
  const q =
    model.error < 0.01 ? "excellent" : model.error < 0.02 ? "bon" : model.error < 0.04 ? "moyen" : "faible";

  box.innerHTML = `${rows}
    <div class="admix-fit">
      <span>résidu <b class="mono">${formatDist(model.error)}</b> — ajustement ${q}</span>
      <span class="hint">${ms} ms</span>
    </div>
    <p class="hint">Un modèle est une <b>reconstitution</b>, pas une preuve d'ascendance :
    d'autres jeux de sources peuvent produire un résidu comparable. Un résidu faible
    dit que le mélange colle, pas que ces populations précises sont vos ancêtres.</p>`;
}

function copyAdmix() {
  if (!state.admix) {
    toast("Aucun modèle à copier.");
    return;
  }
  const lines = state.admix.parts.map((p) => `${(p.w * 100).toFixed(2)}%\t${p.sample.n}`);
  lines.push(`résidu\t${formatDist(state.admix.error)}`);
  navigator.clipboard
    .writeText(lines.join("\n"))
    .then(() => toast("Modèle copié."))
    .catch(() => toast("Copie impossible."));
}
