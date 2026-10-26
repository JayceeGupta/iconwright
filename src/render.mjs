import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { loadSource } from './source.mjs';

export const ICO_SIZES = [256, 128, 64, 48, 32, 24, 16];
const MASTER = 1024;
const KERNEL = 'lanczos3';

function defaultOutDir() {
  return process.platform === 'win32'
    ? path.resolve(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'iconwright', 'icons')
    : path.resolve(homedir(), '.iconwright', 'icons');
}

function safeName(name) {
  const clean = String(name || 'icon').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
  return clean || 'icon';
}

function colorRgb(color) {
  const input = String(color);
  const hex = /^#([\da-f]{3,8})$/i.exec(input);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), alpha: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(input);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], alpha: rgb[4] === undefined ? 1 : +rgb[4] };
  const names = { white: '#ffffff', black: '#000000', red: '#ff0000', blue: '#0000ff', green: '#008000', transparent: '#00000000' };
  if (names[input.toLowerCase()]) return colorRgb(names[input.toLowerCase()]);
  throw new Error(`unsupported color: ${input}`);
}

// Colors are written into SVG markup, so only plain CSS color syntax is allowed.
function safeColor(value) {
  const s = String(value).trim();
  if (/^(#[\da-f]{3,8}|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%a-z]+\)|[a-z]+)$/i.test(s)) return s;
  throw new Error(`unsupported color: ${s}`);
}

function recolorSvg(svg, color) {
  const target = safeColor(color);
  const colorValue = '(?:currentColor|#[\\da-f]{3,8}\\b|rgba?\\([^)]*\\)|hsla?\\([^)]*\\)|[a-z]+)';
  const fillStroke = new RegExp(`(\\b(?:fill|stroke)\\s*=\\s*)(["'])\\s*(${colorValue})\\s*\\2`, 'gi');
  let found = false;
  svg = svg.replace(fillStroke, (whole, lead, quote, value) => {
    if (/^(?:none|transparent)$/i.test(value)) return whole;
    found = true;
    return `${lead}${quote}${target}${quote}`;
  });
  // Inline CSS declarations can contain colors that are not presentation attributes.
  svg = svg.replace(/(\b(?:fill|stroke)\s*:\s*)([^;"'}]+)/gi, (whole, lead, value) => {
    const trimmed = value.trim();
    if (/^(?:none|transparent)$/i.test(trimmed) || /^url\(/i.test(trimmed)) return whole;
    found = true;
    return `${lead}${target}`;
  });
  if (!found) {
    if (/\bfill\s*=\s*(["'])[^"']*\1/i.test(svg)) {
      svg = svg.replace(/\bfill\s*=\s*(["'])[^"']*\1/i, `fill="${target}"`);
    } else svg = svg.replace(/<svg\b/i, `<svg fill="${target}"`);
  }
  return svg;
}

async function sourcePng(source, color) {
  if (source.svg !== undefined) {
    let svg = source.svg;
    if (color) svg = recolorSvg(svg, color);
    return sharp(Buffer.from(svg), { density: 2400 }).resize(MASTER, MASTER, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: KERNEL }).png().toBuffer();
  }
  let image = sharp(source.raster).rotate().ensureAlpha();
  if (color) {
    const tint = colorRgb(color);
    const { data, info } = await sharp(source.raster).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const tinted = Buffer.from(data);
    for (let i = 0; i < tinted.length; i += 4) {
      tinted[i] = tint.r;
      tinted[i + 1] = tint.g;
      tinted[i + 2] = tint.b;
      tinted[i + 3] = Math.round(data[i + 3] * tint.alpha);
    }
    image = sharp(tinted, { raw: { width: info.width, height: info.height, channels: 4 } });
  }
  return image.resize(MASTER, MASTER, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: KERNEL }).png().toBuffer();
}

async function makeMaster(sourceBuf, opts) {
  const { data, info } = await sharp(sourceBuf).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
  const glyph = sharp(data).resize(MASTER, MASTER, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: KERNEL });
  const shape = opts.shape ?? (opts.bg && opts.bg !== 'transparent' ? 'rounded' : 'none');
  if (!['none', 'square', 'rounded', 'circle'].includes(shape)) throw new Error(`unsupported shape: ${shape}`);
  const hasBg = opts.bg && opts.bg !== 'transparent';
  const padding = opts.padding === undefined ? (shape !== 'none' ? 0.2 : 0.08) : Number(opts.padding);
  if (!Number.isFinite(padding) || padding < 0 || padding >= 0.5) throw new Error('padding must be in [0, 0.5)');
  const inner = Math.max(1, Math.round(MASTER * (1 - 2 * padding)));
  const glyphPng = await glyph.resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: KERNEL }).png().toBuffer();
  const { width, height } = await sharp(glyphPng).metadata();
  const glyphLeft = Math.round((MASTER - width) / 2);
  const glyphTop = Math.round((MASTER - height) / 2);
  const composites = [{ input: glyphPng, left: glyphLeft, top: glyphTop }];
  if (shape !== 'none' && hasBg) {
    const radius = Math.max(0, Math.min(0.5, Number(opts.radius ?? 0.22))) * MASTER;
    if (!Number.isFinite(radius)) throw new Error('radius must be a fraction between 0 and 0.5');
    const fill = safeColor(opts.bg);
    let shapeElement = '';
    if (shape === 'circle') shapeElement = `<circle cx="512" cy="512" r="512" fill="${fill}"/>`;
    else if (shape === 'rounded') shapeElement = `<rect width="1024" height="1024" rx="${radius}" fill="${fill}"/>`;
    else shapeElement = `<rect width="1024" height="1024" fill="${fill}"/>`;
    composites.unshift({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">${shapeElement}</svg>`), left: 0, top: 0 });
  }
  return sharp({ create: { width: MASTER, height: MASTER, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).png().toBuffer();
}

async function previewPng(master) {
  const tileW = 120, tileH = 80;
  const dark = { r: 31, g: 31, b: 31, alpha: 1 }, light = { r: 243, g: 243, b: 243, alpha: 1 };
  const composites = [];
  for (const [tile, color] of [[0, dark], [1, light]]) {
    composites.push({ input: { create: { width: tileW, height: tileH, channels: 4, background: color } }, left: tile * tileW, top: 0 });
    for (const [size, x] of [[48, 16], [24, 78]]) {
      const icon = await sharp(master).resize(size, size, { fit: 'contain', kernel: KERNEL }).png().toBuffer();
      composites.push({ input: icon, left: tile * tileW + x, top: Math.round((tileH - size) / 2) });
    }
  }
  return sharp({ create: { width: tileW * 2, height: tileH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).png().toBuffer();
}

export async function makeIcon(opts) {
  if (!opts?.source) throw new Error('source is required');
  const name = safeName(opts.name);
  const outDir = path.resolve(opts.outDir || defaultOutDir());
  await mkdir(outDir, { recursive: true });
  const source = await loadSource(opts.source);
  const base = await sourcePng(source, opts.color);
  const master = await makeMaster(base, opts);
  const pngSize = opts.pngSize === undefined ? 256 : Math.trunc(Number(opts.pngSize));
  if (!(pngSize >= 16 && pngSize <= MASTER)) throw new Error(`pngSize must be 16-${MASTER}`);
  const resize = (size) => sharp(master).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: KERNEL }).png().toBuffer();
  const icoPngs = [];
  for (const size of ICO_SIZES) icoPngs.push(await resize(size));
  const pngPath = path.join(outDir, `${name}-${pngSize}.png`);
  await writeFile(pngPath, pngSize === 256 ? icoPngs[0] : await resize(pngSize));
  const pngs = [pngPath];
  const ico = path.join(outDir, `${name}.ico`);
  const preview = path.join(outDir, `${name}-preview.png`);
  await writeFile(ico, await pngToIco(icoPngs));
  await writeFile(preview, await previewPng(master));
  return { ico, preview, pngs };
}

export { defaultOutDir };
