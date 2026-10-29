// The icon engine: source -> styled 1024 px master -> .ico, PNGs and other formats.
// renderMaster() works in memory (for previews, design grids and scenes); makeIcon() writes files.
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { loadSource } from './source.mjs';
import { parseColor, parsePaint, recolorSvg } from './color.mjs';
import { atomicWrite, ensureDir } from './fsutil.mjs';

export { parseColor };
// 20 and 40 px keep icons crisp at 125% and 250% display scaling.
export const ICO_SIZES = [256, 128, 64, 48, 40, 32, 24, 20, 16];
export const SHAPES = ['none', 'square', 'rounded', 'squircle', 'circle'];
export const STYLE_KEYS = ['color', 'bg', 'shape', 'radius', 'padding', 'shadow'];
export const FORMATS = ['ico', 'png', 'icns', 'web', 'pngset'];
const MASTER = 1024;
const KERNEL = 'lanczos3';
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

export function defaultOutDir() {
  return process.platform === 'win32'
    ? path.resolve(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'iconwright', 'icons')
    : path.resolve(homedir(), '.iconwright', 'icons');
}

export function safeName(name) {
  const clean = String(name || 'icon').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
  return clean || 'icon';
}

/** Only the style options that change the look (drops undefined). */
export function pickStyle(o = {}) {
  return Object.fromEntries(STYLE_KEYS.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
}

const fit = (size) => ({ fit: 'contain', background: CLEAR, kernel: KERNEL });
export const resizePng = (png, size) => sharp(png).resize(size, size, fit(size)).png().toBuffer();

// ---------- glyph: the source artwork, recolored and trimmed to its visible pixels ----------
// Design loops render the same source in many styles; cache the expensive part.
const glyphCache = new Map();
const GLYPH_CACHE_MAX = 64;

async function sourceKey(ref) {
  const value = String(ref).trim();
  if (value.startsWith('<')) return 'svg:' + createHash('sha1').update(value).digest('hex');
  if (/^[a-z0-9-]+:[a-z0-9-]+$/i.test(value) && !/^[a-z]:/i.test(value)) return 'id:' + value;
  // Files are keyed by content: an edit that keeps the size and time still shows up.
  const data = await readFile(value).catch(() => null);
  return data ? 'file:' + createHash('sha1').update(data).digest('hex') : `missing:${path.resolve(value)}`;
}

async function sourcePng(source, color) {
  const hasColor = color !== undefined && color !== null;
  if (source.svg !== undefined) {
    const svg = hasColor ? recolorSvg(source.svg, color) : source.svg;
    return sharp(Buffer.from(svg), { density: 2400 }).resize(MASTER, MASTER, fit()).png().toBuffer();
  }
  const image = () => sharp(source.raster, { limitInputPixels: 50_000_000 }).rotate().ensureAlpha();
  if (!hasColor) return image().resize(MASTER, MASTER, fit()).png().toBuffer();
  // Tint: every pixel takes the color, keeping its own transparency.
  const tint = parseColor(color);
  const { data, info } = await image().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i] = tint.r; data[i + 1] = tint.g; data[i + 2] = tint.b; data[i + 3] = Math.round(data[i + 3] * tint.alpha);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).resize(MASTER, MASTER, fit()).png().toBuffer();
}

async function glyph(ref, color) {
  const key = `${await sourceKey(ref)}|${color ?? ''}`;
  if (glyphCache.has(key)) { const hit = glyphCache.get(key); glyphCache.delete(key); glyphCache.set(key, hit); return hit; }
  const png = await sourcePng(await loadSource(ref), color);
  // Trim transparent margins only; artwork with an opaque background keeps it.
  const trimmed = await sharp(png).trim({ background: '#00000000', threshold: 1 }).png().toBuffer().catch(() => png);
  glyphCache.set(key, trimmed);
  if (glyphCache.size > GLYPH_CACHE_MAX) glyphCache.delete(glyphCache.keys().next().value);
  return trimmed;
}

// ---------- master: background shape + optional shadow + glyph on a 1024 canvas ----------
function squirclePath(size) {
  // Superellipse (n = 5), close to the continuous-corner shape of iOS/macOS icons.
  const r = size / 2, pts = [];
  for (let i = 0; i < 128; i++) {
    const t = (i / 128) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    pts.push(`${(r + r * Math.sign(c) * Math.abs(c) ** 0.4).toFixed(1)},${(r + r * Math.sign(s) * Math.abs(s) ** 0.4).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** SVG for a background shape (or null for none), sized `size`. */
export function shapeSvg(shape, bg, radius = 0.22, size = MASTER) {
  if (shape === 'none' || !bg || bg === 'transparent') return null;
  const { fill, defs } = parsePaint(bg);
  const r = Math.max(0, Math.min(0.5, Number(radius))) * size;
  const el = shape === 'circle' ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${fill}"/>`
    : shape === 'squircle' ? `<path d="${squirclePath(size)}" fill="${fill}"/>`
    : `<rect width="${size}" height="${size}" rx="${shape === 'rounded' ? r : 0}" fill="${fill}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs>${defs}</defs>${el}</svg>`;
}

function checkStyle(o) {
  const shape = o.shape ?? (o.bg && o.bg !== 'transparent' ? 'rounded' : 'none');
  if (!SHAPES.includes(shape)) throw new Error(`shape must be one of ${SHAPES.join(', ')}`);
  const padding = o.padding === undefined ? (shape !== 'none' ? 0.2 : 0.08) : Number(o.padding);
  if (!Number.isFinite(padding) || padding < 0 || padding >= 0.5) throw new Error('padding must be a fraction from 0 to 0.45');
  const radius = Number(o.radius ?? 0.22);
  if (!Number.isFinite(radius)) throw new Error('radius must be a fraction from 0 to 0.5');
  return { shape, padding, radius };
}

/** Render the styled 1024 px master PNG in memory. o: source + style options. */
export async function renderMaster(o) {
  if (!o?.source) throw new Error('source is required');
  const { shape, padding, radius } = checkStyle(o);
  const g = await glyph(o.source, o.color);
  const inner = Math.max(1, Math.round(MASTER * (1 - 2 * padding)));
  const art = await sharp(g).resize(inner, inner, fit()).png().toBuffer();
  const { width, height } = await sharp(art).metadata();
  const left = Math.round((MASTER - width) / 2), top = Math.round((MASTER - height) / 2);
  const layers = [];
  const bgSvg = shapeSvg(shape, o.bg, radius);
  if (bgSvg) layers.push({ input: Buffer.from(bgSvg), left: 0, top: 0 });
  if (o.shadow) {
    // A soft shadow under the artwork: its silhouette, darkened, blurred and nudged down.
    const flat = await sharp({ create: { width: MASTER, height: MASTER, channels: 4, background: CLEAR } })
      .composite([{ input: art, left, top }]).png().toBuffer();
    // One sharp step per call: sharp reorders operations within a single pipeline.
    const dark = await sharp(flat).linear([0, 0, 0, 0.45], [0, 0, 0, 0]).png().toBuffer();
    const soft = await sharp(dark).blur(14).png().toBuffer();
    const moved = await sharp(soft).extend({ top: 14, background: CLEAR }).png().toBuffer();
    layers.push({ input: await sharp(moved).extract({ left: 0, top: 0, width: MASTER, height: MASTER }).png().toBuffer(), left: 0, top: 0 });
  }
  layers.push({ input: art, left, top });
  return sharp({ create: { width: MASTER, height: MASTER, channels: 4, background: CLEAR } }).composite(layers).png().toBuffer();
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
  const unknown = formats.filter((f) => !FORMATS.includes(f));
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
  if (formats.some((f) => ['icns', 'web', 'pngset'].includes(f))) {
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

// ---------- style strings: "color=white bg=#1DB954 shape=squircle shadow" ----------
// One compact, copyable form for a look, shared by the MCP tools, the CLI and the studio.
export const STYLE_HELP = 'Look, "key=value ...": color=<css> (recolors art), bg=<css or linear-gradient(135deg,#a,#b)>, shape=none|square|rounded|squircle|circle, radius=0-0.5, padding=0-0.45, shadow';

// Splits on spaces outside parentheses, so "bg=rgb(1, 2, 3)" stays one token.
function styleTokens(text) {
  const out = []; let depth = 0, cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Parse a style string into style options. Throws a clear error on unknown keys or bad values. */
export function parseStyle(text) {
  if (text == null || text === '') return {};
  if (typeof text === 'object') return pickStyle(text);
  const out = {};
  for (const token of styleTokens(String(text).trim())) {
    const eq = token.indexOf('=');
    const key = (eq < 0 ? token : token.slice(0, eq)).toLowerCase(), value = eq < 0 ? '' : token.slice(eq + 1).replace(/^["']|["']$/g, '');
    if (key === 'shadow') { out.shadow = !['false', 'no', 'off', '0'].includes(value.toLowerCase()); continue; }
    if (!STYLE_KEYS.includes(key)) throw new Error(`unknown style key "${key}" (use ${STYLE_KEYS.join(', ')})`);
    if (!value) throw new Error(`style key "${key}" needs a value, e.g. ${key}=${{ color: 'white', bg: '#1DB954', shape: 'squircle', radius: '0.22', padding: '0.2' }[key]}`);
    if (key === 'radius' || key === 'padding') {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`style ${key} must be a number, got "${value}"`);
      out[key] = n;
    } else if (key === 'shape') {
      if (!SHAPES.includes(value)) throw new Error(`shape must be one of ${SHAPES.join(', ')}`);
      out.shape = value;
    } else {
      if (key === 'color') parseColor(value);   // fail early with the color error
      else parsePaint(value);
      out[key] = value;
    }
  }
  return out;
}

/** The style string for style options (the inverse of parseStyle). */
export function formatStyle(o = {}) {
  return STYLE_KEYS.filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== false)
    .map((k) => (k === 'shadow' ? 'shadow' : `${k}=${String(o[k]).replace(/\s+/g, '')}`)).join(' ');
}
