// Scene mockups: one icon shown where icons live (taskbar, Start, desktop, Explorer, browser tab,
// macOS Dock, iOS, Android) plus a pixel-true size strip. All drawn with sharp, so it works anywhere.
// Geometry follows each platform's published metrics at 100% scale; `scale` zooms the whole scene.
import { fileURLToPath } from 'node:url';
import { renderMaster, resizePng } from './render.mjs';
import { text, at, svgLayer, compose, mask } from './draw.mjs';
import sharp from 'sharp';

const NEIGHBOR_DIR = fileURLToPath(new URL('../assets/neighbors/', import.meta.url));
// Stand-in apps drawn around the icon when the user's own pinned icons aren't available.
const SAMPLE_APPS = [
  { name: 'File Explorer', source: 'folder.svg', color: '#FFC83D' },
  { name: 'Firefox', source: 'firefoxbrowser.svg', color: '#ffffff', bg: '#FF7139', shape: 'circle', padding: 0.2 },
  { name: 'Discord', source: 'discord.svg', color: '#ffffff', bg: '#5865F2', shape: 'rounded', padding: 0.22 },
  { name: 'Spotify', source: 'spotify.svg', color: '#1ED760' },
  { name: 'Obsidian', source: 'obsidian.svg', color: '#A88BFA' },
  { name: 'Telegram', source: 'telegram.svg', color: '#29A9EB' },
  { name: 'GitHub', source: 'github.svg', color: '#ffffff', bg: '#24292F', shape: 'circle', padding: 0.2 },
  { name: 'Notion', source: 'notion.svg', color: '#191919', bg: '#ffffff', shape: 'rounded', padding: 0.2 },
  { name: 'Steam', source: 'steam.svg', color: '#ffffff', bg: '#1B2838', shape: 'rounded', padding: 0.18 },
];

export const SCENES = ['taskbar', 'start', 'desktop', 'explorer', 'browser', 'dock', 'ios', 'android', 'sizes'];
export const DEFAULT_SCENES = ['taskbar', 'start', 'desktop', 'sizes'];

const SEGOE_DARK = { bar: '#1c1c1c', text: '#ffffff', sub: '#c5c5c5', hover: 'rgba(255,255,255,0.07)', accent: '#4cc2ff', dot: '#a0a0a0' };
const SEGOE_LIGHT = { bar: '#eeeeee', text: '#1b1b1b', sub: '#5d5d5d', hover: 'rgba(0,0,0,0.05)', accent: '#005fb8', dot: '#8a8a8a' };

/** Builds the drawing context: the icon and neighbor icons at any pixel size, cached. */
async function context({ master, label, neighbors, scale }) {
  const cache = new Map();
  const sized = async (key, png, px) => {
    const k = `${key}@${px}`;
    if (!cache.has(k)) cache.set(k, await resizePng(png, px));
    return cache.get(k);
  };
  // Neighbors: the user's own icons (PNG/ICO files) when given, else the sample apps.
  const others = neighbors?.length ? neighbors : SAMPLE_APPS.map((a) => ({ ...a, source: NEIGHBOR_DIR + a.source }));
  const masters = await Promise.all(others.map((n) => renderMaster({ padding: 0.06, ...n }).catch(() => null)));
  const pool = others.map((n, i) => ({ name: n.name, master: masters[i] })).filter((n) => n.master);
  return {
    s: (v) => Math.round(v * scale), scale, label,
    icon: (px) => sized('me', master, Math.round(px * scale)),
    neighbor: (i, px) => { const n = pool[i % pool.length]; return { name: n.name, png: sized(`n${i % pool.length}`, n.master, Math.round(px * scale)) }; },
    neighborCount: pool.length,
  };
}

// ---------- scenes: each returns { width, height, layers } in output pixels ----------

// Windows 11 taskbar: 48 px bar, 40 px buttons, 24 px icons; our app is open and focused.
async function taskbar(c) {
  const { s } = c, W = 440, H = 48;
  const rows = [];
  for (const [i, t] of [[0, SEGOE_DARK], [1, SEGOE_LIGHT]]) {
    const y0 = i * (H + 8);
    const layers = [];
    const slots = 7, start = (W - slots * 44) / 2, mine = 4;
    let bg = `<rect y="${s(y0)}" width="${s(W)}" height="${s(H)}" fill="${t.bar}"/>`;
    if (i === 1) bg += `<rect y="${s(y0)}" width="${s(W)}" height="${Math.max(1, s(1))}" fill="#d6d6d6"/>`;
    for (let k = 0; k < slots; k++) {
      const x = start + k * 44 + 2;
      if (k === mine) {
        bg += `<rect x="${s(x)}" y="${s(y0 + 4)}" width="${s(40)}" height="${s(40)}" rx="${s(4)}" fill="${t.hover}"/>`;
        bg += `<rect x="${s(x + 12)}" y="${s(y0 + 42)}" width="${s(16)}" height="${s(3)}" rx="${s(1.5)}" fill="${t.accent}"/>`;
      } else if (k === 1 || k === 5) bg += `<rect x="${s(x + 17)}" y="${s(y0 + 42)}" width="${s(6)}" height="${s(3)}" rx="${s(1.5)}" fill="${t.dot}"/>`;
    }
    // Start button: the four-pane logo, drawn.
    const sx = start + 2 + 8, sy = y0 + 12;
    bg += [[0, 0], [12.5, 0], [0, 12.5], [12.5, 12.5]].map(([dx, dy]) => `<rect x="${s(sx + dx + 3.5)}" y="${s(sy + dy)}" width="${s(11)}" height="${s(11)}" rx="${s(1)}" fill="${i ? '#0067c0' : '#4cc2ff'}"/>`).join('');
    layers.push(svgLayer(s(W), s(2 * H + 8), bg));
    for (let k = 1; k < slots; k++) {
      const x = start + k * 44 + 2 + 8, png = k === mine ? await c.icon(24) : await c.neighbor(k - 1, 24).png;
      layers.push({ input: png, left: s(x), top: s(y0 + 12) });
    }
    layers.push(at(await text('9:41', { size: s(12), color: t.text }), s(W - 46), s(y0 + 9)));
    layers.push(at(await text('28/10/2026', { size: s(12), color: t.text }), s(W - 74), s(y0 + 25)));
    rows.push(...layers);
  }
  return { width: s(W), height: s(2 * H + 8), layers: rows };
}

// Windows 11 Start menu "Pinned" grid: 32 px icons over 12 px labels.
async function start(c) {
  const { s } = c, W = 440, H = 214, cols = 5, tileW = 80, tileH = 76;
  const t = SEGOE_DARK;
  const layers = [svgLayer(s(W), s(H), `<rect width="${s(W)}" height="${s(H)}" rx="${s(8)}" fill="#2b2b2b"/>`)];
  layers.push(at(await text('Pinned', { size: s(14), weight: 600, color: t.text }), s(24), s(16)));
  const gx = (W - cols * tileW) / 2;
  for (let k = 0; k < cols * 2; k++) {
    const x = gx + (k % cols) * tileW, y = 46 + Math.floor(k / cols) * (tileH + 8);
    const isMe = k === 1;
    const n = isMe ? null : c.neighbor(k > 1 ? k - 1 : k, 32);
    if (isMe) layers.push(svgLayer(s(W), s(H), `<rect x="${s(x + 2)}" y="${s(y)}" width="${s(tileW - 4)}" height="${s(tileH)}" rx="${s(4)}" fill="rgba(255,255,255,0.08)"/>`));
    layers.push({ input: isMe ? await c.icon(32) : await n.png, left: s(x + (tileW - 32) / 2), top: s(y + 12) });
    layers.push(at(await text(isMe ? c.label : n.name, { size: s(12), color: t.text, maxWidth: s(tileW - 6) }), s(x + tileW / 2), s(y + 50), 'top-center'));
  }
  return { width: s(W), height: s(H), layers };
}

// Desktop: medium (48 px) icons with shadowed white labels on a wallpaper; ours is selected.
async function desktop(c) {
  const { s } = c, W = 440, H = 150;
  const wall = `<defs><radialGradient id="w1" cx="0.25" cy="0.9" r="0.9"><stop offset="0" stop-color="#3b6fd8"/><stop offset="1" stop-color="#0d1a3d" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="w2" cx="0.85" cy="0.2" r="0.8"><stop offset="0" stop-color="#7a4fd6"/><stop offset="1" stop-color="#0d1a3d" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${s(W)}" height="${s(H)}" fill="#0d1a3d"/><rect width="${s(W)}" height="${s(H)}" fill="url(#w1)"/><rect width="${s(W)}" height="${s(H)}" fill="url(#w2)"/>`;
  const layers = [svgLayer(s(W), s(H), wall)];
  const cellW = 76, cellH = 96;
  for (let k = 0; k < 4; k++) {
    const x = 8 + k * (cellW + 4), y = 10, isMe = k === 1;
    const n = isMe ? null : c.neighbor(k + 2, 48);
    if (isMe) layers.push(svgLayer(s(W), s(H), `<rect x="${s(x)}" y="${s(y)}" width="${s(cellW)}" height="${s(cellH - 10)}" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.45)" stroke-width="${s(1)}"/>`));
    layers.push({ input: isMe ? await c.icon(48) : await n.png, left: s(x + (cellW - 48) / 2), top: s(y + 6) });
    const name = isMe ? c.label : n.name;
    const shadow = await text(name, { size: s(12), color: '#000000', maxWidth: s(cellW - 4) });
    const label = await text(name, { size: s(12), color: '#ffffff', maxWidth: s(cellW - 4) });
    layers.push(at(shadow, s(x + cellW / 2) + Math.max(1, s(1)), s(y + 60) + Math.max(1, s(1)), 'top-center'));
    layers.push(at(label, s(x + cellW / 2), s(y + 60), 'top-center'));
  }
  // A large (96 px) icon too, as on a desktop set to Large icons.
  layers.push({ input: await c.icon(96), left: s(W - 116), top: s(18) });
  const big = await text('Large icons', { size: s(11), color: 'rgba(255,255,255,0.75)' });
  layers.push(at(big, s(W - 68), s(124), 'top-center'));
  return { width: s(W), height: s(H), layers };
}

// File Explorer window: 16 px title-bar icon, details rows (16 px), one row selected.
async function explorer(c) {
  const { s } = c, W = 440, H = 214, t = SEGOE_DARK;
  let bg = `<rect width="${s(W)}" height="${s(H)}" rx="${s(8)}" fill="#202020"/><rect y="${s(40)}" width="${s(W)}" height="${s(H - 40)}" fill="#191919"/>`;
  bg += `<rect x="${s(8)}" y="${s(74)}" width="${s(W - 16)}" height="${s(26)}" rx="${s(4)}" fill="rgba(96,205,255,0.16)"/>`;
  const layers = [svgLayer(s(W), s(H), bg)];
  layers.push({ input: await c.icon(16), left: s(14), top: s(12) });
  layers.push(at(await text(c.label, { size: s(12), color: t.text, maxWidth: s(200) }), s(40), s(13)));
  layers.push(at(await text('—   ☐   ✕', { size: s(12), color: t.sub }), s(W - 76), s(12)));
  layers.push(at(await text('Name', { size: s(12), color: t.sub }), s(44), s(52)));
  layers.push(at(await text('Type', { size: s(12), color: t.sub }), s(290), s(52)));
  for (let k = 0; k < 5; k++) {
    const y = 78 + k * 26, isMe = k === 0, n = isMe ? null : c.neighbor(k + 4, 16);
    layers.push({ input: isMe ? await c.icon(16) : await n.png, left: s(16), top: s(y + 1) });
    layers.push(at(await text(isMe ? c.label : n.name, { size: s(12), color: t.text, maxWidth: s(220) }), s(44), s(y + 2)));
    layers.push(at(await text('Shortcut', { size: s(12), color: t.sub }), s(290), s(y + 2)));
  }
  return { width: s(W), height: s(H), layers };
}

// Browser tab strips (dark and light): the icon as a 16 px favicon.
async function browser(c) {
  const { s } = c, W = 440, H = 40;
  const layers = [];
  let bg = '';
  for (const [i, th] of [[0, { strip: '#1f1f1f', tab: '#3c3c3c', text: '#e8e8e8', dim: '#9a9a9a' }], [1, { strip: '#e3e3e3', tab: '#ffffff', text: '#1f1f1f', dim: '#5f5f5f' }]]) {
    const y = i * (H + 8);
    bg += `<rect y="${s(y)}" width="${s(W)}" height="${s(H)}" fill="${th.strip}"/><rect x="${s(8)}" y="${s(y + 6)}" width="${s(200)}" height="${s(34)}" rx="${s(8)}" fill="${th.tab}"/>`;
    layers.push({ input: await c.icon(16), left: s(20), top: s(y + 15), _t: th });
    layers.push(at(await text(c.label, { size: s(12), color: th.text, maxWidth: s(150) }), s(44), s(y + 15)));
    layers.push({ input: await c.neighbor(i + 1, 16).png, left: s(224), top: s(y + 15) });
    layers.push(at(await text(c.neighbor(i + 1, 16).name, { size: s(12), color: th.dim, maxWidth: s(150) }), s(248), s(y + 15)));
  }
  return { width: s(W), height: s(2 * H + 8), layers: [svgLayer(s(W), s(2 * H + 8), bg), ...layers.map(({ _t, ...l }) => l)] };
}

// macOS Dock: icons at 64 px on a translucent shelf; a dot marks running apps.
async function dock(c) {
  const { s } = c, W = 440, H = 130, n = 5, size = 56, gap = 10;
  const dw = n * size + (n + 1) * gap, dx = (W - dw) / 2;
  const bg = `<defs><linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0a26b"/><stop offset="0.55" stop-color="#a85ec7"/><stop offset="1" stop-color="#2b3a8f"/></linearGradient></defs>` +
    `<rect width="${s(W)}" height="${s(H)}" fill="url(#sky)"/>` +
    `<rect x="${s(dx)}" y="${s(H - size - 30)}" width="${s(dw)}" height="${s(size + 20)}" rx="${s(18)}" fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.45)" stroke-width="${Math.max(1, s(1))}"/>`;
  const layers = [svgLayer(s(W), s(H), bg)];
  const mine = 2;
  let dots = '';
  for (let k = 0; k < n; k++) {
    const x = dx + gap + k * (size + gap), y = H - size - 20;
    layers.push({ input: k === mine ? await c.icon(size) : await c.neighbor(k + 1, size).png, left: s(x), top: s(y) });
    if (k === mine || k === 0) dots += `<circle cx="${s(x + size / 2)}" cy="${s(H - 14)}" r="${s(2)}" fill="rgba(0,0,0,0.6)"/>`;
  }
  layers.push(svgLayer(s(W), s(H), dots));
  // The name tooltip macOS shows on hover.
  const tip = await text(c.label, { size: s(12), color: '#1d1d1f', maxWidth: s(160) });
  const tx = dx + gap + mine * (size + gap) + size / 2;
  layers.push(svgLayer(s(W), s(H), `<rect x="${s(tx) - tip.width / 2 - s(8)}" y="${s(14)}" width="${tip.width + s(16)}" height="${s(24)}" rx="${s(6)}" fill="rgba(240,240,240,0.92)"/>`));
  layers.push(at(tip, s(tx), s(18), 'top-center'));
  return { width: s(W), height: s(H), layers };
}

function squirclePathAt(size) {
  const r = size / 2, pts = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * 2 * Math.PI, cs = Math.cos(t), sn = Math.sin(t);
    pts.push(`${(r + r * Math.sign(cs) * Math.abs(cs) ** 0.4).toFixed(1)},${(r + r * Math.sign(sn) * Math.abs(sn) ** 0.4).toFixed(1)}`);
  }
  return `<path d="M${pts.join('L')}Z" fill="#000"/>`;
}

// iOS shows icons full-bleed in its rounded mask; transparency becomes black.
async function ios(c) {
  const { s } = c, W = 440, H = 128, size = 60;
  const bg = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a7bd5"/><stop offset="1" stop-color="#00d2ff"/></linearGradient></defs><rect width="${s(W)}" height="${s(H)}" fill="url(#g)"/>`;
  const layers = [svgLayer(s(W), s(H), bg)];
  const px = s(size);
  for (let k = 0; k < 4; k++) {
    const x = 34 + k * 100, isMe = k === 1;
    const n = isMe ? null : c.neighbor(k + 3, size);
    const png = isMe ? await c.icon(size) : await n.png;
    const flat = await sharp({ create: { width: px, height: px, channels: 4, background: '#000' } }).composite([{ input: png }]).png().toBuffer();
    layers.push({ input: await mask(flat, px, squirclePathAt(px)), left: s(x), top: s(26) });
    layers.push(at(await text(isMe ? c.label : n.name, { size: s(11), color: '#ffffff', maxWidth: s(80) }), s(x + size / 2), s(26 + size + 6), 'top-center'));
  }
  return { width: s(W), height: s(H), layers };
}

// Android launchers crop adaptive icons to a shape (circle here); a legacy icon with
// transparent corners gets shrunk onto a white circle instead.
async function android(c) {
  const { s } = c, W = 440, H = 128, size = 56;
  const layers = [svgLayer(s(W), s(H), `<rect width="${s(W)}" height="${s(H)}" fill="#1b2a24"/><circle cx="${s(380)}" cy="${s(20)}" r="${s(120)}" fill="#2f5d4b"/>`)];
  const px = s(size), circle = `<circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="#000"/>`;
  for (let k = 0; k < 4; k++) {
    const x = 40 + k * 100, isMe = k === 1;
    const n = isMe ? null : c.neighbor(k + 5, size);
    const full = isMe ? await c.icon(size) : await n.png;
    const { data } = await sharp(full).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cornerAlpha = data[3];
    let icon;
    if (cornerAlpha > 200) icon = await mask(full, px, circle);
    else {
      const small = await resizePng(full, Math.round(px * 0.7));
      const plate = await sharp({ create: { width: px, height: px, channels: 4, background: '#ffffff' } }).composite([{ input: small, gravity: 'centre' }]).png().toBuffer();
      icon = await mask(plate, px, circle);
    }
    layers.push({ input: icon, left: s(x), top: s(26) });
    layers.push(at(await text(isMe ? c.label : n.name, { size: s(12), color: '#ffffff', maxWidth: s(84) }), s(x + size / 2), s(26 + size + 8), 'top-center'));
  }
  return { width: s(W), height: s(H), layers };
}

// Pixel-true sizes (not zoomed by scale), on dark and light, plus 16 and 24 magnified 4x.
async function sizes(c) {
  const sizesPx = [16, 20, 24, 32, 48], W = 440, rowH = 76;
  const layers = [svgLayer(W, rowH * 2, `<rect width="${W}" height="${rowH}" fill="#1f1f1f"/><rect y="${rowH}" width="${W}" height="${rowH}" fill="#f3f3f3"/>`)];
  const native = (px) => c.iconExact(px);
  for (const [row, color] of [[0, '#bdbdbd'], [1, '#5d5d5d']]) {
    let x = 14;
    for (const px of sizesPx) {
      layers.push({ input: await native(px), left: x, top: row * rowH + 6 + (48 - px) / 2 });
      layers.push(at(await text(String(px), { size: 10, color }), x + px / 2, row * rowH + 58, 'top-center'));
      x += px + 16;
    }
    // Magnified: what the small sizes really contain, pixel for pixel.
    for (const [zx, px, z] of [[270, 16, 3], [340, 24, 2]]) {
      const zoom = await sharp(await native(px)).resize(px * z, px * z, { kernel: 'nearest' }).png().toBuffer();
      layers.push({ input: zoom, left: zx, top: row * rowH + 6 });
      layers.push(at(await text(`${px} ×${z}`, { size: 10, color }), zx + (px * z) / 2, row * rowH + 58, 'top-center'));
    }
  }
  return { width: W, height: rowH * 2, layers };
}

const DRAW = { taskbar, start, desktop, explorer, browser, dock, ios, android, sizes };
const TITLE = { taskbar: 'Windows taskbar', start: 'Start menu', desktop: 'Desktop', explorer: 'File Explorer', browser: 'Browser tab', dock: 'macOS Dock', ios: 'iOS home screen', android: 'Android launcher', sizes: 'Actual pixels' };

/**
 * Render scenes into one image (two columns). o: master (1024 PNG), label (app name),
 * scenes (names; default DEFAULT_SCENES), neighbors ([{ name, source, ...style }]), scale (1-2, default 1).
 */
export async function renderScenes({ master, label = 'My App', scenes = DEFAULT_SCENES, neighbors, scale = 1 }) {
  const bad = scenes.filter((n) => !DRAW[n]);
  if (bad.length) throw new Error(`unknown scene: ${bad.join(', ')} (use ${SCENES.join(', ')})`);
  const c = await context({ master, label, neighbors, scale });
  c.iconExact = async (px) => resizePng(master, px);
  const panels = [];
  for (const name of scenes) {
    const p = await DRAW[name](c);
    const title = await text(TITLE[name], { size: 12, weight: 600, color: '#3a3a44' });
    panels.push({ ...p, title, png: await compose(p.width, p.height, p.layers) });
  }
  // Two columns, each panel under its title.
  const pad = 14, titleH = 22, cols = panels.length > 1 ? 2 : 1;
  const colW = Math.max(...panels.map((p) => p.width));
  const rowsH = [];
  for (let i = 0; i < panels.length; i += cols) rowsH.push(Math.max(...panels.slice(i, i + cols).map((p) => p.height)) + titleH);
  const width = pad + cols * (colW + pad), height = pad + rowsH.reduce((a, h) => a + h + pad, 0);
  const layers = [];
  let y = pad;
  for (let r = 0; r < rowsH.length; r++) {
    for (let k = 0; k < cols; k++) {
      const p = panels[r * cols + k];
      if (!p) continue;
      const x = pad + k * (colW + pad);
      layers.push(at(p.title, x, y));
      layers.push({ input: p.png, left: x, top: y + titleH });
    }
    y += rowsH[r] + pad;
  }
  return compose(width, height, layers, '#f4f4f6');
}
