// Cutout: remove the solid background plate an icon is drawn on (an app tile, a badge) and keep
// only its foreground. Pure pixel code on straight-alpha RGBA, so it runs in Node and the browser.
//
// How: sample inward from all four edges to find the plate color; if most samples agree, key out
// every pixel near that color (soft edges, colors un-blended from the plate), then clear the thin
// rim or border between the transparent surround and the plate. Parts of the artwork in the
// plate's own color go too, like the holes in an "O" (that is usually what you want).

const OPAQUE = 200;
const dist = (d, i, c) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]);

/**
 * Find the plate: rays from each edge walk to the first opaque pixel, skip the rim, and sample.
 * Returns { color: [r, g, b], spread } or null when no single color surrounds the artwork.
 */
export function findPlate(data, width, height) {
  const size = Math.max(width, height);
  const skip = Math.max(2, Math.round(size * 0.04));   // past antialiasing and a thin border
  const samples = [], perSide = [[], [], [], []];
  const RAYS = 12;
  for (let r = 0; r < RAYS; r++) {
    const t = 0.3 + (0.4 * r) / (RAYS - 1);
    const rays = [
      [Math.round(t * (width - 1)), 0, 0, 1], [Math.round(t * (width - 1)), height - 1, 0, -1],
      [0, Math.round(t * (height - 1)), 1, 0], [width - 1, Math.round(t * (height - 1)), -1, 0],
    ];
    for (const [side, ray] of rays.entries()) {
      let [x, y, dx, dy] = ray;
      const limit = (dx ? width : height) / 3;
      let steps = 0;
      while (steps < limit && data[(y * width + x) * 4 + 3] < OPAQUE) { x += dx; y += dy; steps++; }
      if (steps >= limit) continue;
      x += dx * skip; y += dy * skip;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      if (data[i + 3] >= OPAQUE) { const s = [data[i], data[i + 1], data[i + 2]]; samples.push(s); perSide[side].push(s); }
    }
  }
  if (samples.length < RAYS * 2) return null;
  const median = [0, 1, 2].map((c) => samples.map((s) => s[c]).sort((a, b) => a - b)[samples.length >> 1]);
  const off = (s) => Math.hypot(s[0] - median[0], s[1] - median[1], s[2] - median[2]);
  // A plate surrounds the artwork: most rays from every side must land on the same color.
  if (perSide.some((list) => list.filter((s) => off(s) <= 40).length < RAYS * 0.6)) return null;
  const near = samples.map(off).filter((d) => d <= 40);
  return { color: median, spread: Math.max(...near) };
}

/**
 * Cut the plate out of an RGBA buffer in place. Returns the plate as "#rrggbb", or null (and
 * leaves the pixels alone) when the image has no solid background to remove.
 */
export function cutoutPixels(data, width, height) {
  const plate = findPlate(data, width, height);
  if (!plate) return null;
  const c = plate.color;
  const lo = Math.max(28, plate.spread + 12), hi = lo + 60;   // gradient plates widen the band
  const n = width * height;
  // Artwork drawn in a single color (a glyph that fills the image) is not on a plate.
  let opaque = 0, other = 0;
  for (let p = 0; p < n; p++) if (data[p * 4 + 3] >= OPAQUE) { opaque++; if (dist(data, p * 4, c) > hi) other++; }
  if (other < opaque * 0.01) return null;
  const wasClear = new Uint8Array(n), isPlate = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (data[i + 3] < OPAQUE) { wasClear[p] = 1; continue; }
    const d = dist(data, i, c);
    if (d <= lo) { isPlate[p] = 1; data[i + 3] = 0; continue; }
    if (d < hi) {
      // An edge pixel blends artwork and plate: keep the artwork's share and un-blend its color.
      const a = (d - lo) / (hi - lo);
      for (let k = 0; k < 3; k++) data[i + k] = Math.max(0, Math.min(255, Math.round(c[k] + (data[i + k] - c[k]) / a)));
      data[i + 3] = Math.round(data[i + 3] * a);
    }
  }
  // The rim: non-plate pixels reachable from outside the artwork within a short distance,
  // without crossing the plate (a tile's border, glow or antialiased outline).
  const reach = Math.max(2, Math.round(Math.max(width, height) * 0.06));
  const depth = new Int16Array(n).fill(-1);
  let queue = [];
  // Seeds: the transparent surround, and the image border (tiles often run to the edge).
  for (let p = 0; p < n; p++) {
    const x = p % width, y = (p / width) | 0;
    const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    if (wasClear[p] || (border && !isPlate[p])) { depth[p] = 0; data[p * 4 + 3] = 0; queue.push(p); }
  }
  while (queue.length) {
    const next = [];
    for (const p of queue) {
      const x = p % width, y = (p / width) | 0, dd = depth[p] + 1;
      if (dd > reach) continue;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (q < 0 || depth[q] >= 0 || isPlate[q]) continue;
        depth[q] = dd; data[q * 4 + 3] = 0; next.push(q);
      }
    }
    queue = next;
  }
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
