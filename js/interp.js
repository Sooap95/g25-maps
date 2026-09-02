/**
 * Surface interpolée, en complément du choroplèthe.
 *
 * Un choroplèthe ne sait dire qu'une chose par territoire, et rien du tout là
 * où aucun échantillon n'est rattaché : la carte se troue, et les frontières
 * administratives — qui n'ont aucune réalité génétique — deviennent des ruptures
 * de couleur. L'interpolation prend le problème par l'autre bout : chaque
 * échantillon est un point, et la couleur varie continûment entre eux.
 *
 * Méthode : pondération par l'inverse de la distance (Shepard). Simple, sans
 * paramètre à régler, et honnête tant qu'on la coupe au-delà d'un rayon
 * d'influence — sans quoi elle inventerait des valeurs au milieu de l'Atlantique.
 *
 * Le point d'un échantillon est le centre de son territoire, pas son lieu de
 * fouille (voir scripts/enrich_datasets.py) : la surface est une lecture
 * lissée des mêmes données, pas une précision nouvelle.
 */

const IDW = {
  power: 2.5, // exposant de la pondération : plus il est haut, plus c'est local
  radiusPx: 150, // au-delà, on ne colore pas : aucun échantillon ne parle d'ici
  block: 5, // taille du bloc rendu, en pixels écran
};

const InterpolationLayer = L.Layer.extend({
  initialize(opts) {
    this._points = [];
    this._paint = opts.paint;
    this._maskGeo = null;
  },

  onAdd(map) {
    this._map = map;
    const canvas = (this._canvas = document.createElement("canvas"));
    canvas.className = "idw-canvas";
    map.getPanes().overlayPane.appendChild(canvas);
    map.on("moveend zoomend resize", this._reset, this);
    this._reset();
  },

  onRemove(map) {
    map.off("moveend zoomend resize", this._reset, this);
    this._canvas?.remove();
    this._canvas = null;
    this._map = null;
  },

  setData(points, maskGeo) {
    // Deux echantillons rattaches au meme territoire partagent leur centre :
    // on ne garde que le plus proche, sinon 2 686 modernes se ramenent a 242
    // points empiles et l'interpolation calcule mille fois la meme chose.
    const byCell = new Map();
    for (const p of points) {
      const key = `${p.lat},${p.lon}`;
      const cur = byCell.get(key);
      if (!cur || p.d < cur.d) byCell.set(key, p);
    }
    this._points = [...byCell.values()];
    this._maskGeo = maskGeo || null;
    this._reset();
    return this._points.length;
  },

  _reset() {
    const map = this._map;
    const canvas = this._canvas;
    if (!map || !canvas) return;

    const size = map.getSize();
    // La couche peut être ajoutée avant que la carte ait sa taille définitive —
    // panneau replié, onglet en arrière-plan, rotation d'un téléphone. Un canvas
    // de largeur nulle fait échouer createImageData ; on attend le prochain
    // événement de mise en page.
    if (!size.x || !size.y) return;

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, topLeft);
    const dpr = 1; // le lissage vient de l'interpolation, pas de la résolution
    canvas.width = size.x * dpr;
    canvas.height = size.y * dpr;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this._points.length) return;

    const pts = this._points.map((p) => {
      const q = map.latLngToContainerPoint([p.lat, p.lon]);
      return { x: q.x, y: q.y, d: p.d };
    });

    const b = IDW.block;
    const r2 = IDW.radiusPx * IDW.radiusPx;
    const img = ctx.createImageData(canvas.width, canvas.height);
    const data = img.data;

    for (let by = 0; by < canvas.height; by += b) {
      for (let bx = 0; bx < canvas.width; bx += b) {
        const cx = bx + b / 2;
        const cy = by + b / 2;
        let num = 0;
        let den = 0;
        let nearest = Infinity;
        let exact = null;
        for (const p of pts) {
          const dx = p.x - cx;
          const dy = p.y - cy;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < nearest) nearest = dist2;
          if (dist2 > r2) continue;
          if (dist2 < 1) {
            // Le bloc tombe sur l'échantillon lui-même : sa valeur l'emporte,
            // sans quoi la pondération diviserait par zéro.
            exact = p.d;
            break;
          }
          const w = 1 / Math.pow(dist2, IDW.power / 2);
          num += w * p.d;
          den += w;
        }
        if (exact != null) {
          this._fill(data, canvas, bx, by, b, exact);
          continue;
        }
        if (!den || nearest > r2) continue;
        this._fill(data, canvas, bx, by, b, num / den);
      }
    }
    ctx.putImageData(img, 0, 0);
    if (this._maskGeo) this._applyMask(ctx, canvas, map);
  },

  _fill(data, canvas, bx, by, b, value) {
    const [r, g, bl] = this._paint(value);
    for (let y = by; y < Math.min(by + b, canvas.height); y++) {
      let i = (y * canvas.width + bx) * 4;
      for (let x = bx; x < Math.min(bx + b, canvas.width); x++) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = bl;
        data[i + 3] = 235;
        i += 4;
      }
    }
  },

  /**
   * Découpe la surface sur les terres émergées de la carte affichée.
   * Sans ça le dégradé déborde en mer, là où il ne décrit rien.
   */
  _applyMask(ctx, canvas, map) {
    const mask = document.createElement("canvas");
    mask.width = canvas.width;
    mask.height = canvas.height;
    const mc = mask.getContext("2d");
    mc.fillStyle = "#fff";
    mc.beginPath();
    for (const feat of this._maskGeo.features) {
      const geom = feat.geometry;
      if (!geom) continue;
      const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
      for (const poly of polys) {
        for (const ring of poly) {
          // Un sommet sur trois : le masque n'a pas besoin d'être exact au
          // pixel, et un tracé complet du monde coûterait trop cher à chaque
          // déplacement de la carte.
          const step = ring.length > 400 ? 3 : 1;
          for (let i = 0; i < ring.length; i += step) {
            const p = map.latLngToContainerPoint([ring[i][1], ring[i][0]]);
            if (i === 0) mc.moveTo(p.x, p.y);
            else mc.lineTo(p.x, p.y);
          }
          mc.closePath();
        }
      }
    }
    mc.fill("evenodd");
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  },
});
