// Cheap visual iteration: one small image instead of many files.
// - searchSheet: Iconify search results as a numbered contact sheet.
// - designGrid: sources (rows A, B, …) × styles (columns 1, 2, …), each cell labeled "B2".
import sharp from 'sharp';
import { renderMaster, resizePng, pickStyle } from './render.mjs';
import { fetchIcons } from './source.mjs';
import { text, at, svgLayer, compose } from './draw.mjs';

export const MAX_CELLS = 36;
const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Run fn over items with limited parallelism (sharp already uses threads per image).
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// An SVG rendered straight to a small PNG (no styling): for browsing search results.
async function plainIcon(svg, size) {
  const w = Number(/\bwidth="([\d.]+)/.exec(svg)?.[1]) || 24;
  const density = Math.max(72, Math.min(2400, (72 * size * 2) / w));
  return sharp(Buffer.from(svg), { density }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

/** Numbered sheet of Iconify ids. Returns { png, missing } (missing: ids with no artwork). */
export async function searchSheet(rawIds, { columns = 8, size = 40 } = {}) {
  const ids = rawIds.map((id) => String(id).trim());
  const svgs = await fetchIcons(ids);
  const cols = Math.min(columns, ids.length), cellW = 64, cellH = 72;
  const rows = Math.ceil(ids.length / cols);
  const tiles = ids.map((_, i) => `<rect x="${(i % cols) * cellW + 3}" y="${Math.floor(i / cols) * cellH + 3}" width="${cellW - 6}" height="${cellH - 6}" rx="8" fill="#ffffff"/>`);
  const layers = [svgLayer(cols * cellW, rows * cellH, tiles.join(''))];
  const missing = [];
  await mapLimit(ids, 6, async (id, i) => {
    const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
    const svg = svgs.get(id);
    let icon = null;
    if (svg) icon = await plainIcon(svg, size).catch(() => null);
    if (icon) layers.push({ input: icon, left: x + (cellW - size) / 2, top: y + 8 });
    else {
      // A visible gap marker, so an empty cell is never mistaken for a blank icon.
      missing.push(id);
      layers.push(at(await text('missing', { size: 10, color: '#b3261e' }), x + cellW / 2, y + 22, 'top-center'));
    }
    layers.push(at(await text(String(i + 1), { size: 10, color: '#6b6b76' }), x + cellW / 2, y + 52, 'top-center'));
  });
  return { png: await compose(cols * cellW, rows * cellH, layers, '#ececef'), missing };
}

/**
 * Compare sources × styles. sources: Iconify ids, files or raw SVG; styles: style objects
 * (color, bg, shape, radius, padding, shadow) merged over `base`.
 * Each cell: the icon at 64 px on neutral gray, and at 24 px on a dark and a light strip.
 * Returns { png, rows: [{ row, source }], columns: [{ column, ...style }], errors }.
 */
export async function designGrid({ sources, styles = [{}], base = {} }) {
  if (!sources?.length) throw new Error('give at least one source');
  const cols = styles.length || 1;
  if (sources.length * cols > MAX_CELLS) throw new Error(`too many cells (${sources.length} × ${cols}); keep it to ${MAX_CELLS}`);
  if (sources.length > ROWS.length) throw new Error(`at most ${ROWS.length} sources`);
  const cellW = 104, cellH = 124, gutter = 6;
  const width = cols * cellW, height = sources.length * cellH;
  const errors = {};
  const cells = sources.flatMap((source, r) => styles.map((style, c) => ({ source, style: { ...pickStyle(base), ...pickStyle(style) }, r, c })));
  const inner = cellW - gutter * 2;
  const bg = cells.map(({ r, c }) => {
    const x = c * cellW, y = r * cellH;
    return `<rect x="${x + gutter}" y="${y + gutter}" width="${inner}" height="${cellH - gutter * 2}" rx="10" fill="#d9d9de"/>` +
      `<rect x="${x + gutter}" y="${y + 84}" width="${inner / 2}" height="34" fill="#1f1f1f"/>` +
      `<rect x="${x + gutter + inner / 2}" y="${y + 84}" width="${inner / 2}" height="34" fill="#f3f3f3"/>`;
  });
  const layers = [svgLayer(width, height, bg.join(''))];
  await mapLimit(cells, 4, async ({ source, style, r, c }) => {
    const x = c * cellW, y = r * cellH, label = `${ROWS[r]}${c + 1}`;
    try {
      const master = await renderMaster({ source, ...style });
      const big = await resizePng(master, 64), small = await resizePng(master, 24);
      layers.push({ input: big, left: x + (cellW - 64) / 2, top: y + 16 });
      layers.push({ input: small, left: x + gutter + (inner / 2 - 24) / 2, top: y + 89 });
      layers.push({ input: small, left: x + gutter + inner / 2 + (inner / 2 - 24) / 2, top: y + 89 });
    } catch (e) {
      errors[label] = e.message;
      layers.push(at(await text('error', { size: 11, color: '#b3261e' }), x + cellW / 2, y + 44, 'top-center'));
    }
    layers.push(at(await text(label, { size: 10, weight: 600, color: '#3a3a44' }), x + gutter + 5, y + gutter + 3));
  });
  const png = await compose(width, height, layers, '#f4f4f6');
  return {
    png,
    rows: sources.map((source, r) => ({ row: ROWS[r], source })),
    columns: styles.map((style, c) => ({ column: c + 1, ...pickStyle(style) })),
    ...(Object.keys(errors).length ? { errors } : {}),
  };
}
