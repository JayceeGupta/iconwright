// The icon recipe: artwork + style -> one SVG document on a 1024 grid. The server rasterizes this
// SVG for files and MCP images; the studio shows the same SVG in the browser, so both always match.
// Pure string code: runs in Node and in the browser.
import { parsePaint, parseColor, recolorSvg } from './color.mjs';
import { normalizeStyle } from './style.mjs';

export const GRID = 1024;
const f = (n) => Number(n.toFixed(2));

/** Superellipse (n = 5), close to the continuous-corner shape of iOS and macOS icons. */
export function squirclePath(size = GRID, x = 0, y = 0) {
  const r = size / 2, pts = [];
  for (let i = 0; i < 128; i++) {
    const t = (i / 128) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    pts.push(`${f(x + r + r * Math.sign(c) * Math.abs(c) ** 0.4)},${f(y + r + r * Math.sign(s) * Math.abs(s) ** 0.4)}`);
  }
  return `M${pts.join('L')}Z`;
}

/**
 * A rounded rectangle with continuous ("smoothed") corners, the shape iOS and macOS mask icons
 * with: corner radius r, smoothing 0-1 (Apple's look is about 0.6). After the figma-squircle method.
 */
export function smoothRectPath(w, h, r, smoothing = 0.6, x = 0, y = 0) {
  const budget = Math.min(w, h) / 2;
  r = Math.min(r, budget);
  let p = (1 + smoothing) * r;
  const sm = Math.min(smoothing, budget / r - 1);
  p = Math.min(p, budget);
  const rad = (d) => (d * Math.PI) / 180;
  const arcMeasure = 90 * (1 - sm);
  const arc = Math.sin(rad(arcMeasure / 2)) * r * Math.SQRT2;
  const alpha = (90 - arcMeasure) / 2;
  const p3p4 = r * Math.tan(rad(alpha / 2));
  const beta = 45 * sm;
  const c = p3p4 * Math.cos(rad(beta));
  const d = c * Math.tan(rad(beta));
  const b = (p - arc - c - d) / 3, a = 2 * b;
  const n = (v) => f(v);
  return `M${n(x + w - p)} ${n(y)}` +
    `c${n(a)} 0 ${n(a + b)} 0 ${n(a + b + c)} ${n(d)}a${n(r)} ${n(r)} 0 0 1 ${n(arc)} ${n(arc)}c${n(d)} ${n(c)} ${n(d)} ${n(b + c)} ${n(d)} ${n(a + b + c)}` +
    `L${n(x + w)} ${n(y + h - p)}` +
    `c0 ${n(a)} 0 ${n(a + b)} ${n(-d)} ${n(a + b + c)}a${n(r)} ${n(r)} 0 0 1 ${n(-arc)} ${n(arc)}c${n(-c)} ${n(d)} ${n(-(b + c))} ${n(d)} ${n(-(a + b + c))} ${n(d)}` +
    `L${n(x + p)} ${n(y + h)}` +
    `c${n(-a)} 0 ${n(-(a + b))} 0 ${n(-(a + b + c))} ${n(-d)}a${n(r)} ${n(r)} 0 0 1 ${n(-arc)} ${n(-arc)}c${n(-d)} ${n(-c)} ${n(-d)} ${n(-(b + c))} ${n(-d)} ${n(-(a + b + c))}` +
    `L${n(x)} ${n(y + p)}` +
    `c0 ${n(-a)} 0 ${n(-(a + b))} ${n(d)} ${n(-(a + b + c))}a${n(r)} ${n(r)} 0 0 1 ${n(arc)} ${n(-arc)}c${n(c)} ${n(-d)} ${n(b + c)} ${n(-d)} ${n(a + b + c)} ${n(-d)}Z`;
}

/** The clip path for an icon mask: 'ios' | 'mac' (continuous corners), 'circle', or null. */
export function maskPath(kind, size) {
  if (kind === 'ios' || kind === 'mac') return smoothRectPath(size, size, size * 0.2237, 0.6);
  if (kind === 'circle' || kind === 'android') {
    const r = size / 2;
    return `M${f(r)} 0a${f(r)} ${f(r)} 0 1 1 0 ${f(size)}a${f(r)} ${f(r)} 0 1 1 0 ${f(-size)}Z`;
  }
  return null;
}

/** An SVG element for a plate shape filling a size x size box at x,y. */
export function shapeElement(shape, fill, { radius = 0.22, size = GRID, x = 0, y = 0 } = {}) {
  if (shape === 'circle') return `<circle cx="${f(x + size / 2)}" cy="${f(y + size / 2)}" r="${f(size / 2)}" fill="${fill}"/>`;
  if (shape === 'squircle') return `<path d="${squirclePath(size, x, y)}" fill="${fill}"/>`;
  const rx = shape === 'rounded' ? f(Math.max(0, Math.min(0.5, radius)) * size) : 0;
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(size)}" height="${f(size)}" rx="${rx}" fill="${fill}"/>`;
}

/** The viewBox [x, y, w, h] of an SVG string (from viewBox, else width/height, else 24x24). */
export function svgViewBox(svg) {
  const open = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const vb = /\bviewBox\s*=\s*["']\s*([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)\s*["']/i.exec(open);
  if (vb) return vb.slice(1, 5).map(Number);
  const dim = (name) => Number.parseFloat(new RegExp(`\\b${name}\\s*=\\s*["']\\s*([\\d.]+)`, 'i').exec(open)?.[1]);
  const w = dim('width'), h = dim('height');
  return [0, 0, w > 0 ? w : 24, h > 0 ? h : 24];
}

/**
 * The visible-pixel box of an alpha channel, mapped to artwork units.
 * alpha: Uint8 array (one byte per pixel, or RGBA with stride 4), width/height in pixels,
 * view: [x, y, w, h] that the pixels cover. Returns [x, y, w, h], or view when nothing is visible.
 */
export function alphaBox(alpha, width, height, view, stride = 1, threshold = 2) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[(row + x) * stride + (stride === 4 ? 3 : 0)] > threshold) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return view;
  const sx = view[2] / width, sy = view[3] / height;
  return [view[0] + x0 * sx, view[1] + y0 * sy, (x1 - x0 + 1) * sx, (y1 - y0 + 1) * sy];
}

// The artwork's root <svg> rewritten to sit in a box: our position and viewBox, its own content.
export function nestSvg(svg, box, x, y, w, h) {
  const body = svg.replace(/^[\s\S]*?(<svg\b)/i, '$1').replace(/<\/svg>\s*$/i, '</svg>');
  const attrs = /<svg\b([^>]*)>/i.exec(body);
  const kept = attrs[1].replace(/\s(?:x|y|width|height|viewBox|preserveAspectRatio|class)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  return body.replace(attrs[0], `<svg${kept} x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" viewBox="${box.map(f).join(' ')}" preserveAspectRatio="xMidYMid meet" overflow="visible">`);
}

/**
 * Compose the styled icon as an SVG document (1024 grid; pass `size` for its pixel width).
 * art: { svg, box } for vector artwork (box = visible area in its own units, see alphaBox),
 *   or { href, width, height, box } for a raster image (box in image pixels).
 * style: style options (color, bg, shape, radius, padding, shadow).
 */
export function composeIconSvg(art, style = {}, { size = GRID } = {}) {
  const st = normalizeStyle(style);
  const defs = [];
  let plate = '';
  if (st.bg) {
    const paint = parsePaint(st.bg, 'iw-bg');
    defs.push(paint.defs);
    plate = shapeElement(st.shape, paint.fill, { radius: st.radius });
  }
  // Fit the visible artwork into the inner square, keeping its proportions.
  const box = art.box;
  const inner = GRID * (1 - 2 * st.padding);
  const k = inner / Math.max(box[2], box[3]);
  const w = box[2] * k, h = box[3] * k, x = (GRID - w) / 2, y = (GRID - h) / 2;
  let body;
  if (art.svg !== undefined) {
    const src = st.color ? recolorSvg(art.svg, st.color) : art.svg;
    body = nestSvg(src, box, x, y, w, h);
  } else {
    // Raster artwork: shift and scale so the visible box lands on x,y,w,h.
    const ix = x - box[0] * k, iy = y - box[1] * k;
    let tint = '';
    if (st.color) {
      const c = parseColor(st.color);
      defs.push(`<filter id="iw-tint" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feFlood flood-color="rgb(${c.r},${c.g},${c.b})" flood-opacity="${c.alpha}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`);
      tint = ' filter="url(#iw-tint)"';
    }
    body = `<image href="${art.href}" x="${f(ix)}" y="${f(iy)}" width="${f(art.width * k)}" height="${f(art.height * k)}" preserveAspectRatio="none"${tint}/>`;
  }
  if (st.shadow) {
    // A soft shadow under the artwork: its silhouette, darkened, blurred and nudged down.
    defs.push(`<filter id="iw-shadow" filterUnits="userSpaceOnUse" x="0" y="0" width="${GRID}" height="${GRID}" color-interpolation-filters="sRGB">` +
      '<feGaussianBlur in="SourceAlpha" stdDeviation="14"/><feOffset dy="14"/><feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer>' +
      '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
    body = `<g filter="url(#iw-shadow)">${body}</g>`;
  }
  // color="#000": artwork drawn in currentColor is black, as it would be in a file viewer.
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${GRID} ${GRID}" color="#000">` +
    `${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${plate}${body}</svg>`;
}
