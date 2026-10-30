// Style strings: "color=white bg=#1DB954 shape=squircle shadow". One compact, copyable form for a
// look, shared by the MCP tools, the CLI and the studio (this file also runs in the browser).
import { parseColor, parsePaint } from './color.mjs';

export const SHAPES = ['none', 'square', 'rounded', 'squircle', 'circle'];
export const STYLE_KEYS = ['cutout', 'color', 'bg', 'shape', 'radius', 'padding', 'shadow'];
const FLAGS = ['cutout', 'shadow'];   // keys that are on when named, like "shadow"
export const DEFAULT_RADIUS = 0.22;
export const STYLE_HELP = 'Look, "key=value ...": cutout (drops the art\'s own background tile), color=<css> (recolors art), bg=<css or linear-gradient(135deg,#a,#b)>, shape=none|square|rounded|squircle|circle, radius=0-0.5, padding=0-0.45, shadow';

/** Only the style options that change the look (drops undefined). */
export function pickStyle(o = {}) {
  return Object.fromEntries(STYLE_KEYS.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
}

// Splits on spaces outside parentheses, so "bg=rgb(1, 2, 3)" stays one token.
export function styleTokens(text) {
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
    if (FLAGS.includes(key)) { out[key] = !['false', 'no', 'off', '0'].includes(value.toLowerCase()); continue; }
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
    .map((k) => (FLAGS.includes(k) ? k : `${k}=${String(o[k]).replace(/\s+/g, '')}`)).join(' ');
}

const hasBg = (bg) => !!bg && bg !== 'transparent' && bg !== 'none';

/** Fills in defaults and checks ranges: { cutout, color, bg, shape, radius, padding, shadow }. */
export function normalizeStyle(o = {}) {
  const shape = o.shape ?? (hasBg(o.bg) ? 'rounded' : 'none');
  if (!SHAPES.includes(shape)) throw new Error(`shape must be one of ${SHAPES.join(', ')}`);
  const drawn = shape !== 'none' && hasBg(o.bg);
  const padding = o.padding === undefined || o.padding === null ? (drawn ? 0.2 : 0.08) : Number(o.padding);
  if (!Number.isFinite(padding) || padding < 0 || padding >= 0.5) throw new Error('padding must be a fraction from 0 to 0.45');
  const radius = Number(o.radius ?? DEFAULT_RADIUS);
  if (!Number.isFinite(radius)) throw new Error('radius must be a fraction from 0 to 0.5');
  return { cutout: !!o.cutout, color: o.color ?? null, bg: drawn ? o.bg : null, shape: drawn ? shape : 'none', radius: Math.max(0, Math.min(0.5, radius)), padding, shadow: !!o.shadow };
}
