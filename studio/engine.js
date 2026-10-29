// The studio's drawing engine. Everything you see is drawn here, in the browser, from the same
// recipes the server uses (shared/icon.mjs and shared/scenes.mjs), so edits show instantly.
// The server is only asked for local artwork (app icons, files) and for downloads.
import { composeIconSvg, svgViewBox, alphaBox, nestSvg, maskPath } from './shared/icon.mjs';
import { buildScene, APPS, SCENE_APPS } from './shared/scenes.mjs';

const MEASURE = 512;
export const FONTS = {
  win: '"Segoe UI Variable Text","Segoe UI",Inter,system-ui,sans-serif',
  mac: '-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,system-ui,sans-serif',
  android: '"Google Sans",Roboto,Inter,system-ui,sans-serif',
  chrome: 'system-ui,"Segoe UI",Roboto,Inter,sans-serif',
  ui: 'Inter,system-ui,sans-serif',
};

const svgUrl = (svg) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
export async function loadImage(url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

// ---------- artwork ----------
/** Measure vector artwork: the box its visible pixels cover (same method as the server). */
export async function measureSvg(svg) {
  const view = svgViewBox(svg);
  const k = MEASURE / Math.max(view[2], view[3]);
  const w = Math.max(1, Math.round(view[2] * k)), h = Math.max(1, Math.round(view[3] * k));
  const url = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" color="#000">${nestSvg(svg, view, 0, 0, w, h)}</svg>`);
  try {
    const img = await loadImage(url);
    const c = new OffscreenCanvasOr(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return { svg, box: alphaBox(ctx.getImageData(0, 0, w, h).data, w, h, view, 4) };
  } finally { URL.revokeObjectURL(url); }
}

function OffscreenCanvasOr(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

const artCache = new Map();
/**
 * Load artwork for a source: an Iconify id, raw SVG, or (local studio) app:<name> or a file path.
 * api(op, params) reaches the local server.
 */
export function loadArt(source, api) {
  if (artCache.has(source)) return artCache.get(source);
  const p = (async () => {
    const s = source.trim();
    if (s.startsWith('<')) return measureSvg(s);
    const m = /^([a-z0-9-]+):([a-z0-9-]+)$/i.exec(s);
    if (m && !/^app:/i.test(s)) {
      const res = await fetch(`https://api.iconify.design/${m[1]}/${m[2]}.svg`);
      const text = res.ok ? await res.text() : '';
      if (!text.startsWith('<svg')) throw new Error(`No icon called "${s}".`);
      return measureSvg(text);
    }
    return api('art', { source: s });   // local: app icons and files, measured by the server
  })();
  artCache.set(source, p);
  p.catch(() => artCache.delete(source));
  if (artCache.size > 80) artCache.delete(artCache.keys().next().value);
  return p;
}

// ---------- a styled icon, ready to draw at any size ----------
export class Icon {
  static async create(art, style) {
    const svg = composeIconSvg(art, style, { size: 512 });
    const url = svgUrl(svg);
    const img = await loadImage(url);
    return new Icon(svg, url, img);
  }
  constructor(svg, url, img) { this.svg = svg; this.url = url; this.img = img; this.rasters = new Map(); }
  /** A PNG data URL of the icon at exactly px pixels. */
  raster(px) {
    px = Math.max(1, Math.round(px));
    if (!this.rasters.has(px)) {
      const c = document.createElement('canvas'); c.width = px; c.height = px;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.img, 0, 0, px, px);
      this.rasters.set(px, { url: c.toDataURL(), canvas: c });
    }
    return this.rasters.get(px).url;
  }
  /** Whether the corners are transparent (decides how Android shows it). */
  hasClearCorners() {
    this.raster(32);
    const d = this.rasters.get(32).canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 1, 1).data;
    return d[3] < 200;
  }
  /** Light artwork wants a dark plate, and the other way round. */
  plateColor() {
    this.raster(32);
    const d = this.rasters.get(32).canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 32, 32).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
    return n && sum / n / 255 > 0.6 ? '#1f2228' : '#ffffff';
  }
  dispose() { URL.revokeObjectURL(this.url); }
}

// Sample apps for the scenes, loaded once.
const neighborIcons = new Map();
export function neighborIcon(key, base = './neighbors/') {
  if (!neighborIcons.has(key)) {
    const app = APPS[key];
    neighborIcons.set(key, (async () => {
      const svg = await (await fetch(`${base}${app.file}.svg`)).text();
      return Icon.create(await measureSvg(svg), { padding: 0, ...app.style });
    })().catch(() => null));
  }
  return neighborIcons.get(key);
}

// ---------- scenes ----------
const measureCtx = (() => { let c; return () => (c ??= document.createElement('canvas').getContext('2d')); })();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function fitText(text, n) {
  if (!n.maxWidth) return text;
  const ctx = measureCtx();
  ctx.font = `${n.weight ?? 400} ${n.size}px ${FONTS[n.font] ?? FONTS.ui}`;
  if (ctx.measureText(text).width <= n.maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > n.maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

let uid = 0;
/**
 * Draw a scene into an <svg> element. icons: { me: Icon, [appKey]: Icon }. dpr: raster density.
 * Returns the element; call again to redraw (cheap: strings only).
 */
export function drawScene(name, { label, theme, names }, icons) {
  const prefix = `s${++uid}`;
  const scene = buildScene(name, { label, theme, names, prefix });
  let defs = '', body = '';
  for (const n of scene.nodes) {
    if (n.t === 'svg') body += n.body;
    else if (n.t === 'text') {
      const text = esc(fitText(n.text, n));
      const attrs = `x="${n.x}" y="${(n.y + n.size * 0.93).toFixed(1)}" font-family='${FONTS[n.font] ?? FONTS.ui}' font-size="${n.size}" font-weight="${n.weight ?? 400}" text-anchor="${n.anchor ?? 'start'}"`;
      if (n.shadow) body += `<text ${attrs} fill="rgba(0,0,0,0.7)" transform="translate(0.8 0.8)" filter="url(#${prefix}-ts)">${text}</text>`;
      body += `<text ${attrs} fill="${n.color}">${text}</text>`;
    } else if (n.t === 'pixels') {
      const icon = icons.me;
      if (icon) body += `<image data-px="${n.px}" href="${icon.raster(n.px)}" x="${n.x}" y="${n.y}" width="${n.px * n.zoom}" height="${n.px * n.zoom}" style="image-rendering:pixelated" preserveAspectRatio="none"/>`;
    } else if (n.t === 'icon') {
      const icon = icons[n.app];
      if (!icon) continue;
      // The browser draws the vector at the scene's real size on this screen.
      const me = n.app === 'me' ? ' data-me=""' : '';
      let inner = `<image${me} href="${icon.url}" x="${n.x}" y="${n.y}" width="${n.size}" height="${n.size}"/>`;
      if (n.mask === 'ios') {
        // iOS fills transparency with black, then applies its mask.
        inner = `<rect x="${n.x}" y="${n.y}" width="${n.size}" height="${n.size}" fill="#000"/>${inner}`;
      } else if (n.mask === 'android' && icon.hasClearCorners()) {
        const k = 0.72, s2 = n.size * k, o = (n.size - s2) / 2;
        inner = `<rect x="${n.x}" y="${n.y}" width="${n.size}" height="${n.size}" fill="${icon.plateColor()}"/><image${me} href="${icon.url}" x="${n.x + o}" y="${n.y + o}" width="${s2}" height="${s2}"/>`;
      }
      const clipKind = n.mask === 'ios' ? 'ios' : n.mask === 'android' ? 'circle' : null;
      let g = inner;
      if (clipKind) {
        const id = `${prefix}-c${++uid}`;
        defs += `<clipPath id="${id}"><path transform="translate(${n.x} ${n.y})" d="${maskPath(clipKind, n.size)}"/></clipPath>`;
        g = `<g clip-path="url(#${id})">${inner}</g>`;
      }
      if (n.shadow) g = `<g filter="url(#${prefix}-sh)">${g}</g>`;
      body += g;
    }
  }
  defs += `<filter id="${prefix}-sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.3"/></filter>`;
  defs += `<filter id="${prefix}-ts" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="0.6"/></filter>`;
  return { width: scene.width, height: scene.height, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" role="img"><defs>${defs}</defs>${body}</svg>` };
}

/** Point an already drawn scene at a new icon (fast path: no re-layout). */
export function retarget(root, icon) {
  for (const el of root.querySelectorAll('image[data-me]')) el.setAttribute('href', icon.url);
  for (const el of root.querySelectorAll('image[data-px]')) el.setAttribute('href', icon.raster(Number(el.dataset.px)));
}

/** The sample apps a scene needs. */
export const sceneApps = (name) => SCENE_APPS[name] ?? [];
