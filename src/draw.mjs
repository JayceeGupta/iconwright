// Small drawing kit for preview images (sheets, design grids, scene mockups).
// Text uses the bundled Inter font, so images look the same on every OS (and on servers with no fonts).
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseColor } from './color.mjs';

const FONT = {
  400: fileURLToPath(new URL('../assets/fonts/Inter-Regular.ttf', import.meta.url)),
  600: fileURLToPath(new URL('../assets/fonts/Inter-SemiBold.ttf', import.meta.url)),
};
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
// Pango markup takes #rrggbb plus a separate alpha.
function pangoColor(color) {
  const { r, g, b, alpha } = parseColor(color);
  const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return alpha < 1 ? `foreground="${hex}" fgalpha="${Math.round(alpha * 100)}%"` : `foreground="${hex}"`;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Text as a PNG layer. Returns { input, width, height } (input is null for empty text).
 * o: size (px), weight (400|600), color, maxWidth (ellipsized to fit), align ('left'|'centre'|'right').
 */
export async function text(str, { size = 12, weight = 400, color = '#1b1b1b', maxWidth, align = 'left' } = {}) {
  let value = String(str ?? '');
  if (!value.trim()) return { input: null, width: 0, height: 0 };
  const render = async (v) => {
    const family = weight >= 600 ? 'Inter SemiBold' : 'Inter';
    const { data, info } = await sharp({ text: {
      text: `<span ${pangoColor(color)}>${esc(v)}</span>`, font: `${family} ${size}`, fontfile: FONT[weight >= 600 ? 600 : 400],
      rgba: true, dpi: 72, align,
    } }).png().toBuffer({ resolveWithObject: true });
    return { input: data, width: info.width, height: info.height };
  };
  let out = await render(value);
  // Shorten until it fits (rare: labels are short); a few passes at most.
  for (let i = 0; maxWidth && out.width > maxWidth && value.length > 2 && i < 12; i++) {
    value = value.slice(0, Math.max(1, Math.floor(value.length * maxWidth / out.width) - 1)).trimEnd();
    out = await render(value + '…');
  }
  return out;
}

/** A layer for sharp.composite, positioned; x/y may be centered with anchor 'center' | 'top-center'. */
export function at(layer, x, y, anchor = 'top-left') {
  if (!layer?.input) return null;
  const left = anchor === 'center' || anchor === 'top-center' ? Math.round(x - layer.width / 2) : Math.round(x);
  const top = anchor === 'center' ? Math.round(y - layer.height / 2) : Math.round(y);
  return { input: layer.input, left, top };
}

/** An SVG string as a full-size layer at 0,0 (shapes, bars, backgrounds). */
export function svgLayer(width, height, body) {
  return { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`), left: 0, top: 0 };
}

/** Flatten layers onto a canvas. layers: composite entries (nulls are skipped). */
export async function compose(width, height, layers, background = CLEAR) {
  const list = layers.filter(Boolean).filter((l) => l.left < width && l.top < height);
  return sharp({ create: { width, height, channels: 4, background } }).composite(list).png().toBuffer();
}

/** Clip an icon PNG to an SVG mask shape (circle, squircle path …) of its own size. */
export async function mask(png, size, shapeSvgBody) {
  const m = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${shapeSvgBody}</svg>`);
  return sharp(png).resize(size, size).composite([{ input: m, blend: 'dest-in' }]).png().toBuffer();
}

export { esc };
