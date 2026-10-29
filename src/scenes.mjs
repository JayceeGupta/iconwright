// Draws the scene layouts from shared/scenes.mjs with sharp, for MCP images and the docs.
// The studio draws the same layouts in the browser.
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { renderMaster, resizePng, plateColor } from './render.mjs';
import { text, at, compose, mask } from './draw.mjs';
import { SCENES, DEFAULT_SCENES, TITLES, APPS, SCENE_APPS, buildScene } from './shared/scenes.mjs';
import { maskPath } from './shared/icon.mjs';

export { SCENES, DEFAULT_SCENES };
const NEIGHBOR_DIR = fileURLToPath(new URL('../assets/neighbors/', import.meta.url));
// Scenes that show Windows, where the user's own pinned apps can stand in for the samples.
const WINDOWS_SCENES = new Set(['taskbar', 'start', 'desktop', 'explorer']);
const SWAPPABLE = new Set(['edge', 'vscode', 'spotify', 'discord', 'steam', 'telegram', 'slack', 'figma', 'whatsapp', 'obsidian']);

// Sample app masters never change: render each once per process.
const sampleMasters = new Map();
function sampleMaster(key) {
  if (!sampleMasters.has(key)) {
    const app = APPS[key];
    sampleMasters.set(key, renderMaster({ padding: 0, ...app.style, source: `${NEIGHBOR_DIR}${app.file}.svg` }).catch(() => null));
  }
  return sampleMasters.get(key);
}

const sized = new Map();
async function at1(cacheKey, png, px) {
  const k = `${cacheKey}@${px}`;
  if (!sized.has(k)) { sized.set(k, resizePng(png, px)); if (sized.size > 400) sized.delete(sized.keys().next().value); }
  return sized.get(k);
}

async function maskedIcon(png, px, kind) {
  if (kind === 'ios') {
    // iOS fills transparency with black, then applies its mask.
    const flat = await sharp({ create: { width: px, height: px, channels: 4, background: '#000' } }).composite([{ input: png }]).png().toBuffer();
    return mask(flat, px, `<path d="${maskPath('ios', px)}"/>`);
  }
  if (kind === 'android') {
    // Adaptive icons fill the mask; a legacy icon with transparent corners sits on a plate.
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (data[3] > 200) return mask(png, px, `<path d="${maskPath('circle', px)}"/>`);
    const small = await resizePng(png, Math.round(px * 0.72));
    const plate = await sharp({ create: { width: px, height: px, channels: 4, background: await plateColor(png) } }).composite([{ input: small, gravity: 'centre' }]).png().toBuffer();
    return mask(plate, px, `<path d="${maskPath('circle', px)}"/>`);
  }
  return png;
}

async function dropShadow(png, px) {
  const pad = Math.ceil(px * 0.12);
  const dark = await sharp(png).linear([0, 0, 0, 0.3], [0, 0, 0, 0]).png().toBuffer();
  const soft = await sharp(dark).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).blur(Math.max(0.5, px * 0.05)).png().toBuffer();
  return { input: soft, dx: -pad, dy: -pad + Math.round(px * 0.04) };
}

/** Draw one scene to a PNG. c: { master, label, theme, scale, neighbors (user's apps) }. */
async function drawScene(name, c) {
  const swap = WINDOWS_SCENES.has(name) && c.neighbors?.length;
  // Map sample apps to the user's pinned apps, in order, where a scene shows Windows.
  const mine = new Map(), names = {};
  if (swap) {
    let i = 0;
    for (const key of SCENE_APPS[name]) if (SWAPPABLE.has(key) && i < c.neighbors.length) { mine.set(key, c.neighbors[i]); names[key] = c.neighbors[i].name; i++; }
  }
  const scene = buildScene(name, { label: c.label, theme: c.theme, names });
  const s = name === 'sizes' ? 1 : c.scale;
  const S = (v) => Math.round(v * s);
  const layers = [];
  for (const n of scene.nodes) {
    if (n.t === 'svg') {
      layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S(scene.width)}" height="${S(scene.height)}"><g transform="scale(${s})">${n.body}</g></svg>`), left: 0, top: 0 });
    } else if (n.t === 'icon') {
      const px = S(n.size);
      const master = n.app === 'me' ? c.master : (mine.get(n.app)?.master ?? await sampleMaster(n.app));
      if (!master) continue;
      let png = await at1(n.app === 'me' ? 'me' : (mine.has(n.app) ? `u:${mine.get(n.app).name}` : n.app), master, px);
      if (n.mask) png = await maskedIcon(png, px, n.mask);
      if (n.shadow) { const sh = await dropShadow(png, px); layers.push({ input: sh.input, left: S(n.x) + sh.dx, top: S(n.y) + sh.dy }); }
      layers.push({ input: png, left: S(n.x), top: S(n.y) });
    } else if (n.t === 'text') {
      const opts = { size: S(n.size), weight: n.weight ?? 400, maxWidth: n.maxWidth ? S(n.maxWidth) : undefined };
      const anchor = n.anchor === 'middle' ? 'top-center' : 'top-left';
      const place = async (color, dx = 0, dy = 0) => {
        const img = await text(n.text, { ...opts, color });
        if (!img.input) return;
        const x = n.anchor === 'end' ? S(n.x) - img.width : S(n.x);
        layers.push(at(img, x + dx, S(n.y) + dy, n.anchor === 'end' ? 'top-left' : anchor));
      };
      if (n.shadow) await place('rgba(0,0,0,0.75)', Math.max(1, S(1)), Math.max(1, S(1)));
      await place(n.color);
    } else if (n.t === 'pixels') {
      const png = await resizePng(c.master, n.px);
      const out = n.zoom > 1 ? await sharp(png).resize(n.px * n.zoom, n.px * n.zoom, { kernel: 'nearest' }).png().toBuffer() : png;
      layers.push({ input: out, left: S(n.x), top: S(n.y) });
    }
  }
  return { width: S(scene.width), height: S(scene.height), png: await compose(S(scene.width), S(scene.height), layers) };
}

/**
 * Render scenes into one image (titled panels, two columns when they fit). o: master (1024 PNG),
 * label (app name), scenes (default DEFAULT_SCENES), neighbors ([{ name, source, ...style }],
 * the user's pinned apps), scale (1-2, default 1), theme ('dark' | 'light'; default per scene).
 */
export async function renderScenes({ master, label = 'My App', scenes = DEFAULT_SCENES, neighbors, scale = 1, theme }) {
  const bad = scenes.filter((n) => !SCENES.includes(n));
  if (bad.length) throw new Error(`unknown scene: ${bad.join(', ')} (use ${SCENES.join(', ')})`);
  const users = neighbors?.length
    ? (await Promise.all(neighbors.map(async (n) => ({ name: n.name, master: await renderMaster({ padding: 0.06, ...n }).catch(() => null) })))).filter((n) => n.master)
    : null;
  const c = { master, label, scale, theme, neighbors: users };
  const panels = [];
  for (const name of scenes) {
    const p = await drawScene(name, c);
    panels.push({ ...p, title: await text(TITLES[name], { size: 13, weight: 600, color: '#2b2f36' }) });
  }
  // Panels flow left to right, wrapping at about 1500 px.
  const pad = 16, titleH = 24, maxW = Math.max(1500, ...panels.map((p) => p.width + 2 * pad));
  const rows = [];
  let row = [], rowW = pad;
  for (const p of panels) {
    if (row.length && rowW + p.width + pad > maxW) { rows.push(row); row = []; rowW = pad; }
    row.push(p); rowW += p.width + pad;
  }
  if (row.length) rows.push(row);
  const width = Math.max(...rows.map((r) => r.reduce((a, p) => a + p.width + pad, pad)));
  const layers = [];
  let y = pad;
  for (const r of rows) {
    let x = pad;
    for (const p of r) {
      layers.push(at(p.title, x, y));
      layers.push({ input: p.png, left: x, top: y + titleH });
      x += p.width + pad;
    }
    y += Math.max(...r.map((p) => p.height)) + titleH + pad;
  }
  return compose(width, y, layers, '#f4f5f7');
}
