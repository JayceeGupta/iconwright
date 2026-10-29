// The icon engine: source -> styled 1024 px master -> .ico, PNGs and other formats.
// The look itself is defined once, in shared/icon.mjs (an SVG recipe the studio also draws in the
// browser); this file loads artwork, measures it, and rasterizes the recipe with sharp.
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { loadSource } from './source.mjs';
import { parseColor } from './shared/color.mjs';
import { composeIconSvg, svgViewBox, alphaBox, nestSvg, GRID } from './shared/icon.mjs';
import { SHAPES, STYLE_KEYS, STYLE_HELP, pickStyle, parseStyle, formatStyle, normalizeStyle } from './shared/style.mjs';
import { atomicWrite, ensureDir } from './fsutil.mjs';

export { parseColor, SHAPES, STYLE_KEYS, STYLE_HELP, pickStyle, parseStyle, formatStyle };
// 20 and 40 px keep icons crisp at 125% and 250% display scaling.
export const ICO_SIZES = [256, 128, 64, 48, 40, 32, 24, 20, 16];
export const FORMATS = ['ico', 'png', 'icns', 'web', 'pngset'];
const MASTER = GRID;
const KERNEL = 'lanczos3';
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const MEASURE = 512;   // artwork is measured at this size to find its visible box

export function defaultOutDir() {
  return process.platform === 'win32'
    ? path.resolve(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'iconwright', 'icons')
    : path.resolve(homedir(), '.iconwright', 'icons');
}

export function safeName(name) {
  const clean = String(name || 'icon').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
  return clean || 'icon';
}

const fit = () => ({ fit: 'contain', background: CLEAR, kernel: KERNEL });
export const resizePng = (png, size) => sharp(png).resize(size, size, fit()).png().toBuffer();

// ---------- artwork: loaded and measured once per source ----------
const artCache = new Map();
const ART_CACHE_MAX = 64;

async function sourceKey(ref) {
  const value = String(ref).trim();
  if (value.startsWith('<')) return 'svg:' + createHash('sha1').update(value).digest('hex');
  if (/^[a-z0-9-]+:[a-z0-9-]+$/i.test(value) && !/^[a-z]:/i.test(value)) return 'id:' + value;
  // Files are keyed by content: an edit that keeps the size and time still shows up.
  const data = await readFile(value).catch(() => null);
  return data ? 'file:' + createHash('sha1').update(data).digest('hex') : `missing:${path.resolve(value)}`;
}

/** Vector artwork: the SVG plus the box its visible pixels cover. */
export async function measureSvg(svg) {
  const view = svgViewBox(svg);
  const k = MEASURE / Math.max(view[2], view[3]);
  const w = Math.max(1, Math.round(view[2] * k)), h = Math.max(1, Math.round(view[3] * k));
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" color="#000">${nestSvg(svg, view, 0, 0, w, h)}</svg>`;
  const { data, info } = await sharp(Buffer.from(doc)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { svg, box: alphaBox(data, info.width, info.height, view, 4) };
}

/** Raster artwork: a PNG data URL (at most 1024 px) plus the box of its visible pixels. */
export async function measureRaster(raster) {
  const png = await sharp(raster, { limitInputPixels: 50_000_000 }).rotate().ensureAlpha()
    .resize(MASTER, MASTER, { fit: 'inside', withoutEnlargement: true, kernel: KERNEL }).png().toBuffer();
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return { href: `data:image/png;base64,${png.toString('base64')}`, width: info.width, height: info.height,
    box: alphaBox(data, info.width, info.height, [0, 0, info.width, info.height], 4) };
}

/** The measured artwork for a source reference (cached). */
export async function artFor(ref) {
  const key = await sourceKey(ref);
  if (artCache.has(key)) { const hit = artCache.get(key); artCache.delete(key); artCache.set(key, hit); return hit; }
  const src = await loadSource(ref);
  const art = src.svg !== undefined ? await measureSvg(src.svg) : await measureRaster(src.raster);
  artCache.set(key, art);
  if (artCache.size > ART_CACHE_MAX) artCache.delete(artCache.keys().next().value);
  return art;
}

/** The styled icon as an SVG document (what the studio shows). */
export async function iconSvg(o) {
  if (!o?.source) throw new Error('source is required');
  return composeIconSvg(await artFor(o.source), o);
}

/** Render the styled 1024 px master PNG in memory. o: source + style options. */
export async function renderMaster(o) {
  if (!o?.source) throw new Error('source is required');
  normalizeStyle(o);   // range errors before any work
  const svg = composeIconSvg(await artFor(o.source), o);
  return sharp(Buffer.from(svg)).resize(MASTER, MASTER).png().toBuffer();
}

/** A plate color that contrasts with the icon: dark behind light artwork, white otherwise. */
export async function plateColor(png) {
  const { data } = await sharp(png).resize(64, 64, fit()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++;
  }
  return n && sum / n / 255 > 0.6 ? '#1f2228' : '#ffffff';
}

/** The quick look: the icon at 48 and 24 px on a dark and a light background (240x80). */
export async function previewPng(master) {
  const tileW = 120, tileH = 80, layers = [];
  for (const [tile, bg] of [[0, '#1f1f1f'], [1, '#f3f3f3']]) {
    layers.push({ input: { create: { width: tileW, height: tileH, channels: 4, background: bg } }, left: tile * tileW, top: 0 });
    for (const [size, x] of [[48, 16], [24, 78]]) layers.push({ input: await resizePng(master, size), left: tile * tileW + x, top: Math.round((tileH - size) / 2) });
  }
  return sharp({ create: { width: tileW * 2, height: tileH, channels: 4, background: CLEAR } }).composite(layers).png().toBuffer();
}

/**
 * Make icon files. o: source, style options, name, outDir, pngSize,
 * formats (any of ico, png, icns, web, pngset; default ico + png), preview (default true).
 * Returns { ico?, png?, icns?, web?, pngset?, preview? } with file paths.
 */
export async function makeIcon(o) {
  if (!o?.source) throw new Error('source is required');
  const formats = [...new Set(o.formats?.length ? o.formats : ['ico', 'png'])];
  const unknown = formats.filter((x) => !FORMATS.includes(x));
  if (unknown.length) throw new Error(`unknown format: ${unknown.join(', ')} (use ${FORMATS.join(', ')})`);
  const name = safeName(o.name);
  const outDir = path.resolve(o.outDir || defaultOutDir());
  await ensureDir(outDir);
  const master = await renderMaster(o);
  const out = {};
  if (formats.includes('ico')) {
    out.ico = path.join(outDir, `${name}.ico`);
    await atomicWrite(out.ico, await pngToIco(await Promise.all(ICO_SIZES.map((s) => resizePng(master, s)))));
  }
  if (formats.includes('png')) {
    const size = o.pngSize === undefined ? 256 : Math.trunc(Number(o.pngSize));
    if (!(size >= 16 && size <= MASTER)) throw new Error(`pngSize must be 16-${MASTER}`);
    out.png = path.join(outDir, `${name}-${size}.png`);
    await atomicWrite(out.png, size === MASTER ? master : await resizePng(master, size));
  }
  if (formats.some((x) => ['icns', 'web', 'pngset'].includes(x))) {
    const fm = await import('./formats.mjs');
    if (formats.includes('icns')) out.icns = await fm.writeIcns(master, path.join(outDir, `${name}.icns`));
    if (formats.includes('pngset')) out.pngset = await fm.writePngSet(master, outDir, name);
    if (formats.includes('web')) {
      // Android crops maskable icons to any shape: with a background, redraw it full-bleed with
      // the artwork inside the safe zone; without one, put it on a contrasting plate.
      const hasBg = o.bg && o.bg !== 'transparent';
      const maskable = hasBg ? await renderMaster({ ...o, shape: 'square', padding: Math.max(0.24, Number(o.padding ?? 0.2)) }) : undefined;
      const plate = hasBg && !/gradient/i.test(o.bg) ? o.bg : await plateColor(master);
      out.web = (await fm.writeFaviconBundle(master, outDir, name, { maskableBg: plate, maskable })).dir;
    }
  }
  if (o.preview !== false) {
    out.preview = path.join(outDir, `${name}-preview.png`);
    await atomicWrite(out.preview, await previewPng(master));
  }
  return out;
}
