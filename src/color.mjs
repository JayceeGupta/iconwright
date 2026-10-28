// Colors for icon styles: CSS color parsing, SVG recoloring and background paints (incl. gradients).
const NAMED_COLORS = Object.fromEntries(`
aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32
`.trim().split(/\s+/).map((entry) => entry.split(':')));

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

export function safeColor(value) {
  const { r, g, b, alpha } = parseColor(value);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function recolorSvg(svg, color) {
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


// Splits on commas that are not inside parentheses: "135deg, rgb(1,2,3), red" -> 3 parts.
function splitTopLevel(text) {
  const parts = []; let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

const SIDES = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270, 'to top right': 45, 'to right top': 45,
  'to bottom right': 135, 'to right bottom': 135, 'to bottom left': 225, 'to left bottom': 225, 'to top left': 315, 'to left top': 315 };

/**
 * A background paint for SVG: a CSS color, or "linear-gradient(<angle>|to <side>, <color> [<pos>%], ...)".
 * Returns { fill, defs } where fill goes in a fill="" attribute and defs holds any <linearGradient>.
 */
export function parsePaint(value, id = 'bg') {
  const text = String(value).trim();
  const m = /^linear-gradient\((.*)\)$/is.exec(text);
  if (!m) return { fill: safeColor(text), defs: '' };
  const parts = splitTopLevel(m[1]);
  let angle = 180;
  if (SIDES[parts[0]?.toLowerCase()] !== undefined) angle = SIDES[parts.shift().toLowerCase()];
  else if (/^[+-]?[\d.]+(deg|grad|rad|turn)$/i.test(parts[0])) angle = hueDegrees(parts.shift());
  if (parts.length < 2) throw new Error(`a gradient needs at least two colors: ${text}`);
  const stops = parts.map((part, i) => {
    const pos = /\s+([+-]?[\d.]+)%$/.exec(part);
    const color = parseColor(pos ? part.slice(0, pos.index) : part);
    const offset = pos ? Math.max(0, Math.min(100, Number(pos[1]))) : (i / (parts.length - 1)) * 100;
    return `<stop offset="${offset}%" stop-color="rgb(${color.r},${color.g},${color.b})" stop-opacity="${color.alpha}"/>`;
  });
  // CSS angles: 0deg points up, 90deg right. Map to a vector across the unit box.
  const rad = (angle * Math.PI) / 180, dx = Math.sin(rad) / 2, dy = -Math.cos(rad) / 2;
  const f = (n) => Number(n.toFixed(4));
  const defs = `<linearGradient id="${id}" x1="${f(0.5 - dx)}" y1="${f(0.5 - dy)}" x2="${f(0.5 + dx)}" y2="${f(0.5 + dy)}">${stops.join('')}</linearGradient>`;
  return { fill: `url(#${id})`, defs };
}
