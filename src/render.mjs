import { homedir } from 'node:os';
import path from 'node:path';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { loadSource } from './source.mjs';

export const ICO_SIZES = [256, 128, 64, 48, 32, 24, 16];
const MASTER = 1024;
const KERNEL = 'lanczos3';
const NAMED_COLORS = Object.fromEntries(`
aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32
`.trim().split(/\s+/).map((entry) => entry.split(':')));

function defaultOutDir() {
  return process.platform === 'win32'
    ? path.resolve(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'iconwright', 'icons')
    : path.resolve(homedir(), '.iconwright', 'icons');
}

function safeName(name) {
  const clean = String(name || 'icon').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
  return clean || 'icon';
}

const NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';

function channel(value) {
  const percent = value.endsWith('%');
  const number = Number(percent ? value.slice(0, -1) : value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.max(0, Math.min(255, percent ? number * 255 / 100 : number)));
}

function alphaValue(value) {
  if (value === undefined) return 1;
  const percent = value.endsWith('%');
  const text = percent ? value.slice(0, -1) : value;
  if (!new RegExp(`^${NUMBER}$`).test(text)) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, percent ? number / 100 : number));
}

function hslToRgb(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = Math.max(0, Math.min(1, saturation / 100));
  const l = Math.max(0, Math.min(1, lightness / 100));
  if (s === 0) {
    const value = Math.round(l * 255);
    return { r: value, g: value, b: value };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hueChannel = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: Math.round(hueChannel(h + 1 / 3) * 255),
    g: Math.round(hueChannel(h) * 255),
    b: Math.round(hueChannel(h - 1 / 3) * 255),
  };
}

function hueDegrees(value) {
  const match = new RegExp(`^(${NUMBER})(deg|grad|rad|turn)?$`, 'i').exec(value);
  if (!match) return null;
  const number = Number(match[1]);
  const unit = (match[2] || 'deg').toLowerCase();
  if (!Number.isFinite(number)) return null;
  return number * (unit === 'turn' ? 360 : unit === 'grad' ? 0.9 : unit === 'rad' ? 180 / Math.PI : 1);
}

function splitFunctionalArgs(body) {
  if (body.includes(',')) {
    const parts = body.split(',').map((part) => part.trim());
    if (parts.some((part) => !part) || parts.some((part) => part.includes('/'))) return null;
    return parts;
  }
  const slash = body.split('/');
  if (slash.length > 2) return null;
  const parts = slash[0].trim().split(/\s+/);
  if (slash.length === 2) parts.push(slash[1].trim());
  if (parts.some((part) => !part)) return null;
  return parts;
}

export function parseColor(value) {
  const input = String(value).trim();
  const hex = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(input);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = [...digits].map((part) => part + part).join('');
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      alpha: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }
  const normalized = input.toLowerCase();
  if (normalized === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };
  if (NAMED_COLORS[normalized]) return parseColor(`#${NAMED_COLORS[normalized]}`);

  const fn = /^(rgba?|hsla?)\((.*)\)$/i.exec(input);
  if (fn) {
    const parts = splitFunctionalArgs(fn[2]);
    const isHsl = fn[1].toLowerCase().startsWith('hsl');
    const hasComma = fn[2].includes(',');
    const expectedMin = 3;
    if (!parts || parts.length < expectedMin || parts.length > 4 || (!hasComma && parts.length === 4 && !fn[2].includes('/')) || (hasComma && parts.length === 4 && !parts[3])) {
      throw new Error(`unsupported color: ${input}`);
    }
    const alpha = alphaValue(parts[3]);
    if (alpha === null) throw new Error(`unsupported color: ${input}`);
    if (!isHsl) {
      const channels = parts.slice(0, 3).map((part) => {
        if (!(new RegExp(`^(?:${NUMBER}|${NUMBER}%)$`).test(part))) return null;
        return channel(part);
      });
      if (channels.some((part) => part === null)) throw new Error(`unsupported color: ${input}`);
      return { r: channels[0], g: channels[1], b: channels[2], alpha };
    }
    const hue = hueDegrees(parts[0]);
    const percentage = new RegExp(`^(${NUMBER})%$`);
    const sat = percentage.exec(parts[1]), light = percentage.exec(parts[2]);
    if (hue === null || !sat || !light) throw new Error(`unsupported color: ${input}`);
    return { ...hslToRgb(hue, Number(sat[1]), Number(light[1])), alpha };
  }
  throw new Error(`unsupported color: ${input}`);
}

function safeColor(value) {
  const { r, g, b, alpha } = parseColor(value);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

function rasterImage(input) {
  return sharp(input, { limitInputPixels: 50_000_000 });
}

async function sourcePng(source, color) {
  const hasColor = color !== undefined && color !== null;
  if (source.svg !== undefined) {
    let svg = source.svg;
    if (hasColor) svg = recolorSvg(svg, color);
    return sharp(Buffer.from(svg), { density: 2400 }).resize(MASTER, MASTER, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: KERNEL }).png().toBuffer();
  }
  let image = rasterImage(source.raster).rotate().ensureAlpha();
  if (hasColor) {
    const tint = parseColor(color);
    const { data, info } = await rasterImage(source.raster).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  const pngs = [pngPath];
  const ico = path.join(outDir, `${name}.ico`);
  const preview = path.join(outDir, `${name}-preview.png`);
  await atomicWrite(pngPath, pngSize === 256 ? icoPngs[0] : await resize(pngSize));
  await atomicWrite(ico, await pngToIco(icoPngs));
  await atomicWrite(preview, await previewPng(master));
  return { ico, preview, pngs };
}

async function atomicWrite(target, data) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, data, { flag: 'wx' });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export { defaultOutDir };
