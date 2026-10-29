// Scene mockups: where an icon lives (Windows taskbar, Start, desktop, File Explorer, a browser,
// the macOS Dock, iOS, Android) plus a pixel-true size strip.
//
// Each scene is a pure layout: background vector art, icon slots, text and pixel strips, in CSS px
// at 100% scale. Two small renderers draw it: the studio (SVG in the browser, instant) and the
// server (sharp, for MCP images and docs). Pure code: runs in Node and in the browser.

export const SCENES = ['taskbar', 'start', 'desktop', 'explorer', 'browser', 'dock', 'ios', 'android', 'sizes'];
export const DEFAULT_SCENES = ['taskbar', 'start', 'desktop', 'sizes'];
export const TITLES = { taskbar: 'Windows taskbar', start: 'Start menu', desktop: 'Desktop', explorer: 'File Explorer', browser: 'Browser tab', dock: 'macOS Dock', ios: 'iPhone', android: 'Android', sizes: 'Actual pixels' };
/** Scenes that can be drawn light or dark (the others have one look). */
export const THEMED = { taskbar: 'both', start: 'dark', explorer: 'dark', browser: 'both' };

// Stand-in apps. file: assets/neighbors/<file>.svg; style: how the app's real icon looks there.
const WHITE = { bg: '#ffffff', shape: 'square', padding: 0.17 };
export const APPS = {
  explorer: { name: 'File Explorer', file: 'file-explorer' },
  edge: { name: 'Microsoft Edge', file: 'edge' },
  vscode: { name: 'Visual Studio Code', file: 'vscode' },
  spotify: { name: 'Spotify', file: 'spotify' },
  discord: { name: 'Discord', file: 'discord' },
  steam: { name: 'Steam', file: 'steam' },
  telegram: { name: 'Telegram', file: 'telegram' },
  slack: { name: 'Slack', file: 'slack' },
  figma: { name: 'Figma', file: 'figma' },
  whatsapp: { name: 'WhatsApp', file: 'whatsapp' },
  obsidian: { name: 'Obsidian', file: 'obsidian' },
  github: { name: 'GitHub', file: 'github' },
  recycle: { name: 'Recycle Bin', file: 'recycle-bin' },
  thispc: { name: 'This PC', file: 'this-pc' },
  // Phones: app icons fill their mask, so each gets the plate its real icon has.
  photos: { name: 'Photos', file: 'photos', style: WHITE },
  maps: { name: 'Maps', file: 'maps', style: WHITE },
  youtube: { name: 'YouTube', file: 'youtube', style: { ...WHITE, padding: 0.2 } },
  gmail: { name: 'Gmail', file: 'gmail', style: { ...WHITE, padding: 0.2 } },
  netflix: { name: 'Netflix', file: 'netflix', style: { padding: 0 } },
  appstore: { name: 'App Store', file: 'app-store', style: { padding: 0 } },
  safari: { name: 'Safari', file: 'safari', style: { bg: '#ffffff', shape: 'square', padding: 0.08 } },
  mspotify: { name: 'Spotify', file: 'spotify-glyph', style: { color: '#1ED760', bg: '#121212', shape: 'square', padding: 0.2 } },
  mwhatsapp: { name: 'WhatsApp', file: 'whatsapp-glyph', style: { color: '#ffffff', bg: 'linear-gradient(180deg,#5af777,#1dbb40)', shape: 'square', padding: 0.2 } },
  messages: { name: 'Messages', file: 'messages-glyph', style: { color: '#ffffff', bg: 'linear-gradient(180deg,#6cf185,#2ac94b)', shape: 'square', padding: 0.2 } },
  music: { name: 'Music', file: 'music-glyph', style: { color: '#ffffff', bg: 'linear-gradient(180deg,#fb5c74,#fa233b)', shape: 'square', padding: 0.22 } },
  // macOS icons sit on their own plates.
  mvscode: { name: 'Visual Studio Code', file: 'vscode', style: { bg: '#ffffff', shape: 'squircle', padding: 0.2 } },
  mslack: { name: 'Slack', file: 'slack', style: { bg: '#ffffff', shape: 'squircle', padding: 0.22 } },
  mfigma: { name: 'Figma', file: 'figma', style: { bg: '#1e1e1e', shape: 'squircle', padding: 0.24 } },
  mspot: { name: 'Spotify', file: 'spotify', style: { bg: '#121212', shape: 'squircle', padding: 0.2 } },
  msafari: { name: 'Safari', file: 'safari', style: { bg: '#ffffff', shape: 'squircle', padding: 0.1 } },
};
/** The neighbor apps a scene uses (so renderers can prepare only those). */
export const SCENE_APPS = {
  taskbar: ['explorer', 'edge', 'vscode', 'spotify', 'discord'],
  start: ['edge', 'explorer', 'vscode', 'spotify', 'discord', 'steam', 'telegram', 'slack', 'figma', 'whatsapp', 'obsidian'],
  desktop: ['recycle', 'thispc', 'edge', 'spotify', 'steam', 'discord'],
  explorer: ['explorer', 'edge', 'spotify', 'discord', 'telegram', 'vscode', 'thispc'],
  browser: ['github', 'youtube'],
  dock: ['msafari', 'mvscode', 'mspot', 'mfigma', 'mslack'],
  ios: ['photos', 'maps', 'youtube', 'gmail', 'netflix', 'appstore', 'mspotify', 'messages', 'safari', 'music', 'mwhatsapp'],
  android: ['photos', 'maps', 'youtube', 'gmail', 'netflix', 'mspotify', 'mwhatsapp', 'messages'],
  sizes: [],
};

const FONT = { win: 'win', mac: 'mac', ios: 'mac', android: 'android', chrome: 'chrome' };
const r1 = (n) => Math.round(n * 10) / 10;

// ---------- small vector kit ----------
const rect = (x, y, w, h, fill, rx = 0, extra = '') => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}"${rx ? ` rx="${rx}"` : ''} fill="${fill}"${extra}/>`;
const stroke = (d, color, w = 1.2, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

/** Windows logo: four panes, w px square, with a soft blue gradient. */
function winLogo(x, y, w, id, dark) {
  const g = Math.max(1, w * 0.06), p = (w - g) / 2;
  const top = dark ? '#7fd7ff' : '#1b9de2', bottom = dark ? '#2b9cf2' : '#0067c0';
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>` +
    [[0, 0], [p + g, 0], [0, p + g], [p + g, p + g]].map(([dx, dy]) => rect(x + dx, y + dy, p, p, `url(#${id})`, 1.2)).join('');
}
const searchGlyph = (x, y, s, c) => stroke(`M${x + s * 0.62} ${y + s * 0.62}L${x + s} ${y + s}M${x + s * 0.7} ${y + s * 0.38}a${s * 0.32} ${s * 0.32} 0 1 1 -${s * 0.64} 0a${s * 0.32} ${s * 0.32} 0 1 1 ${s * 0.64} 0`, c, 1.3);
const wifiGlyph = (x, y, c) => stroke(`M${x} ${y + 5}q8 -7 16 0M${x + 3} ${y + 8.2}q5 -4.4 10 0M${x + 6} ${y + 11.2}q2 -1.6 4 0`, c, 1.4) + `<circle cx="${x + 8}" cy="${y + 13.6}" r="1.1" fill="${c}"/>`;
const volumeGlyph = (x, y, c) => `<path d="M${x} ${y + 6}h3l4 -3.5v13l-4 -3.5h-3z" fill="none" stroke="${c}" stroke-width="1.2" stroke-linejoin="round"/>` + stroke(`M${x + 10} ${y + 5.5}q2 3 0 6M${x + 12.5} ${y + 3.5}q3.6 5 0 10`, c, 1.2);
const batteryGlyph = (x, y, c) => `<rect x="${x}" y="${y + 4}" width="17" height="9" rx="2.2" fill="none" stroke="${c}" stroke-width="1.1"/><rect x="${x + 2}" y="${y + 6}" width="10" height="5" rx="1" fill="${c}"/><rect x="${x + 17.6}" y="${y + 6.8}" width="1.6" height="3.4" rx=".8" fill="${c}"/>`;
const chevronUp = (x, y, c) => stroke(`M${x} ${y + 3.5}l3.5 -3.5l3.5 3.5`, c, 1.2);
const windowButtons = (right, y, c, w = 46) => stroke(`M${right - w * 3 + 18} ${y}h10`, c, 1) +
  `<rect x="${right - w * 2 + 18}" y="${y - 5}" width="10" height="10" rx="1.5" fill="none" stroke="${c}" stroke-width="1"/>` +
  stroke(`M${right - w + 18} ${y - 5}l10 10M${right - w + 28} ${y - 5}l-10 10`, c, 1);

// Windows 11 "bloom": translucent petals opening from the lower middle.
function bloom(W, H, id, light = false) {
  const bg = light ? ['#d9e7fa', '#a9c6ef'] : ['#0a1a3a', '#04102a'];
  const petal = light ? ['#6ea6ff', '#1f62d0'] : ['#5aa2ff', '#0d3a99'];
  const cx = W * 0.62, cy = H * 1.05, R = Math.max(W, H) * 0.62;
  let petals = '';
  const angles = [-62, -38, -14, 10, 34, 58];
  angles.forEach((a, i) => {
    const op = 0.42 + 0.08 * (i % 3);
    petals += `<ellipse cx="${r1(cx)}" cy="${r1(cy - R * 0.55)}" rx="${r1(R * 0.2)}" ry="${r1(R * 0.62)}" fill="url(#${id}p)" opacity="${op}" transform="rotate(${a} ${r1(cx)} ${r1(cy)})"/>`;
  });
  return `<defs><linearGradient id="${id}b" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient>` +
    `<linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${petal[0]}"/><stop offset="1" stop-color="${petal[1]}"/></linearGradient>` +
    `<radialGradient id="${id}g" cx="0.62" cy="0.95" r="0.6"><stop offset="0" stop-color="${light ? '#ffffff' : '#7cc0ff'}" stop-opacity="${light ? 0.7 : 0.35}"/><stop offset="1" stop-color="${light ? '#ffffff' : '#7cc0ff'}" stop-opacity="0"/></radialGradient></defs>` +
    `<filter id="${id}f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${r1(Math.max(W, H) / 90)}"/></filter>` +
    rect(0, 0, W, H, `url(#${id}b)`) + `<g filter="url(#${id}f)">${petals}</g>` + rect(0, 0, W, H, `url(#${id}g)`);
}

// macOS-like wallpaper: warm dusk hills.
function macWall(W, H, id) {
  return `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3d8f"/><stop offset="0.55" stop-color="#a65fc0"/><stop offset="1" stop-color="#f3a86b"/></linearGradient>` +
    `<linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b3e8e"/><stop offset="1" stop-color="#2a1d4f"/></linearGradient></defs>` +
    rect(0, 0, W, H, `url(#${id}s)`) +
    `<path d="M0 ${H * 0.62} C${W * 0.25} ${H * 0.45} ${W * 0.45} ${H * 0.7} ${W * 0.7} ${H * 0.55} S${W} ${H * 0.5} ${W} ${H * 0.5} V${H} H0Z" fill="url(#${id}h)" opacity="0.85"/>` +
    `<path d="M0 ${H * 0.8} C${W * 0.3} ${H * 0.68} ${W * 0.6} ${H * 0.9} ${W} ${H * 0.72} V${H} H0Z" fill="#1d1538" opacity="0.8"/>`;
}

// ---------- scenes ----------
// Each builder gets ctx { label, theme, id(name) } and returns { width, height, nodes }.
// Nodes: { t: 'svg', body } | { t: 'icon', app: 'me' | key, x, y, size, mask?, shadow? }
//      | { t: 'text', x, y, text, size, weight?, color, anchor?, maxWidth?, font?, shadow? }
//      | { t: 'pixels', x, y, px, zoom }

function taskbarBand(nodes, y0, W, dark, id, label) {
  const t = dark
    ? { bar: 'rgba(28,28,28,0.86)', edge: 'rgba(255,255,255,0.08)', text: '#ffffff', sub: '#d0d0d0', plate: 'rgba(255,255,255,0.06)', plateEdge: 'rgba(255,255,255,0.05)', active: '#60cdff', dot: '#9a9a9a', pill: 'rgba(255,255,255,0.06)', pillEdge: 'rgba(255,255,255,0.09)' }
    : { bar: 'rgba(238,238,238,0.88)', edge: 'rgba(0,0,0,0.08)', text: '#1b1b1b', sub: '#5d5d5d', plate: 'rgba(255,255,255,0.7)', plateEdge: 'rgba(0,0,0,0.06)', active: '#005fb8', dot: '#7a7a7a', pill: 'rgba(255,255,255,0.75)', pillEdge: 'rgba(0,0,0,0.08)' };
  const wallH = 34, H = 48, y = y0 + wallH;
  let body = `<svg x="0" y="${y0}" width="${W}" height="${wallH + H}" overflow="hidden">${bloom(W, wallH + H + 120, id('w'), !dark)}</svg>`;
  body += rect(0, y, W, H, t.bar) + rect(0, y, W, 1, t.edge);
  // Centered group: Start, search pill, six apps (ours is focused).
  const apps = ['explorer', 'edge', 'me', 'vscode', 'spotify', 'discord'];
  const searchW = 172, groupW = 44 + 4 + searchW + 4 + apps.length * 44;
  let x = Math.round((W - groupW) / 2);
  body += winLogo(x + 11, y + 13, 22, id('logo'), dark);
  x += 48;
  body += rect(x, y + 8, searchW, 32, t.pill, 16, ` stroke="${t.pillEdge}"`) + searchGlyph(x + 14, y + 17, 13, t.sub);
  nodes.push({ t: 'svg', body });
  nodes.push({ t: 'text', x: x + 38, y: y + 16, text: 'Search', size: 13, color: t.sub, font: 'win' });
  x += searchW + 4;
  let marks = '';
  apps.forEach((app, i) => {
    const bx = x + i * 44 + 2;
    if (app === 'me') {
      marks += rect(bx, y + 4, 40, 40, t.plate, 4, ` stroke="${t.plateEdge}"`) + rect(bx + 12, y + 41, 16, 3, t.active, 1.5);
    } else if (app === 'explorer' || app === 'vscode' || app === 'discord') {
      marks += rect(bx + 17, y + 41, 6, 3, t.dot, 1.5);
    }
  });
  nodes.push({ t: 'svg', body: marks });
  apps.forEach((app, i) => nodes.push({ t: 'icon', app, x: x + i * 44 + 10, y: y + 12, size: 24 }));
  // Tray: chevron, Wi-Fi, volume, battery, two-line clock.
  const right = W - 12;
  nodes.push({ t: 'svg', body: chevronUp(right - 168, y + 22, t.text) + wifiGlyph(right - 144, y + 16, t.text) + volumeGlyph(right - 120, y + 15, t.text) + batteryGlyph(right - 96, y + 15, t.text) });
  nodes.push({ t: 'text', x: right - 6, y: y + 8, text: '9:41 AM', size: 12, color: t.text, anchor: 'end', font: 'win' });
  nodes.push({ t: 'text', x: right - 6, y: y + 25, text: '10/29/2026', size: 12, color: t.text, anchor: 'end', font: 'win' });
  return wallH + H;
}

function taskbar({ theme, id, label }) {
  const W = 880, nodes = [];
  const themes = theme === 'both' ? [true, false] : [theme !== 'light'];
  let y = 0;
  themes.forEach((dark, i) => { y += taskbarBand(nodes, y, W, dark, (n) => id(`${n}${i}`), label); });
  return { width: W, height: y, nodes };
}

function start({ theme, id, label, nm }) {
  const dark = theme !== 'light';
  const t = dark
    ? { panel: 'rgba(36,36,36,0.94)', edge: 'rgba(255,255,255,0.09)', text: '#ffffff', sub: '#c8c8c8', field: 'rgba(255,255,255,0.05)', fieldEdge: 'rgba(255,255,255,0.08)', fieldLine: '#9a9a9a', hover: 'rgba(255,255,255,0.07)', btn: 'rgba(255,255,255,0.06)', foot: 'rgba(28,28,28,0.9)' }
    : { panel: 'rgba(242,242,242,0.95)', edge: 'rgba(0,0,0,0.1)', text: '#1b1b1b', sub: '#5d5d5d', field: 'rgba(255,255,255,0.85)', fieldEdge: 'rgba(0,0,0,0.08)', fieldLine: '#8a8a8a', hover: 'rgba(0,0,0,0.045)', btn: 'rgba(255,255,255,0.8)', foot: 'rgba(232,232,232,0.95)' };
  const W = 600, H = 556, px = 40, py = 24, pw = 520, ph = 508;
  const nodes = [];
  let body = bloom(W, H, id('w'), !dark);
  body += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="8" fill="${t.panel}" stroke="${t.edge}"/>`;
  // Search box.
  body += rect(px + 28, py + 24, pw - 56, 34, t.field, 17, ` stroke="${t.fieldEdge}"`) + searchGlyph(px + 44, py + 34, 13, t.sub);
  // Pinned header + "All >" button.
  body += rect(px + pw - 28 - 64, py + 76, 64, 26, t.btn, 4, ` stroke="${t.fieldEdge}"`) + stroke(`M${px + pw - 44} ${py + 85}l4 4l-4 4`, t.text, 1.2);
  // Our tile is hovered.
  const gx = px + 22, gy = py + 116, tw = (pw - 44) / 6, th = 80;
  body += rect(gx + tw + 2, gy, tw - 4, th, t.hover, 4);
  // Bottom bar: avatar, name, power.
  const fy = py + ph - 60;
  body += `<path d="M${px} ${fy}h${pw}v52a8 8 0 0 1 -8 8h-${pw - 16}a8 8 0 0 1 -8 -8z" fill="${t.foot}"/>` + rect(px, fy, pw, 1, t.edge);
  body += `<circle cx="${px + 48}" cy="${fy + 30}" r="16" fill="${dark ? '#4a5a70' : '#9fb3cf'}"/><circle cx="${px + 48}" cy="${fy + 25}" r="6" fill="${dark ? '#c9d6e8' : '#ffffff'}"/><path d="M${px + 37} ${fy + 41}q11 -12 22 0" fill="${dark ? '#c9d6e8' : '#ffffff'}"/>`;
  body += stroke(`M${px + pw - 48} ${fy + 22}v8M${px + pw - 53.5} ${fy + 24.5}a8 8 0 1 0 11 0`, t.text, 1.4);
  nodes.push({ t: 'svg', body });
  nodes.push({ t: 'text', x: px + 66, y: py + 33, text: 'Search for apps, settings, and documents', size: 13, color: t.sub, font: 'win', maxWidth: 380 });
  nodes.push({ t: 'text', x: px + 32, y: py + 80, text: 'Pinned', size: 14, weight: 600, color: t.text, font: 'win' });
  nodes.push({ t: 'text', x: px + pw - 80, y: py + 82, text: 'All', size: 12, color: t.text, font: 'win' });
  const pinned = ['edge', 'me', 'explorer', 'vscode', 'spotify', 'discord', 'steam', 'telegram', 'slack', 'figma', 'whatsapp', 'obsidian'];
  pinned.forEach((app, k) => {
    const x = gx + (k % 6) * tw, y = gy + Math.floor(k / 6) * (th + 6);
    nodes.push({ t: 'icon', app, x: Math.round(x + (tw - 32) / 2), y: y + 12, size: 32 });
    nodes.push({ t: 'text', x: x + tw / 2, y: y + 52, text: app === 'me' ? label : nm(app), size: 12, color: t.text, anchor: 'middle', maxWidth: tw - 8, font: 'win' });
  });
  // Recommended.
  const ry = gy + 2 * (th + 6) + 18;
  nodes.push({ t: 'text', x: px + 32, y: ry, text: 'Recommended', size: 14, weight: 600, color: t.text, font: 'win' });
  const recs = [['me', label, 'Recently added'], ['vscode', 'notes.md', '2h ago'], ['explorer', 'Screenshots', 'Yesterday at 6:12 PM'], ['spotify', 'Spotify', 'Recently added']];
  recs.forEach(([app, title, sub], k) => {
    const x = px + 32 + (k % 2) * 236, y = ry + 32 + Math.floor(k / 2) * 52;
    nodes.push({ t: 'icon', app, x, y: y + 4, size: 32 });
    nodes.push({ t: 'text', x: x + 44, y: y + 3, text: title, size: 12, color: t.text, font: 'win', maxWidth: 176 });
    nodes.push({ t: 'text', x: x + 44, y: y + 21, text: sub, size: 12, color: t.sub, font: 'win', maxWidth: 176 });
  });
  nodes.push({ t: 'text', x: px + 74, y: fy + 22, text: 'Alex Kim', size: 12, color: t.text, font: 'win' });
  return { width: W, height: H, nodes };
}

function desktop({ id, label, nm }) {
  const W = 640, H = 300, nodes = [{ t: 'svg', body: bloom(W, H, id('w')) }];
  // Desktop icons fill columns top to bottom; ours is selected.
  const items = [['recycle', 0, 0], ['thispc', 0, 1], ['edge', 0, 2], ['me', 1, 0], ['spotify', 1, 1], ['steam', 1, 2]];
  const cw = 76, ch = 90;
  for (const [app, col, row] of items) {
    const x = 6 + col * (cw + 4), y = 6 + row * (ch + 4);
    if (app === 'me') nodes.push({ t: 'svg', body: rect(x + 0.5, y + 0.5, cw - 1, ch - 6, 'rgba(100,180,255,0.32)', 0, ' stroke="rgba(170,215,255,0.75)"') });
    nodes.push({ t: 'icon', app, x: x + (cw - 48) / 2, y: y + 4, size: 48 });
    nodes.push({ t: 'text', x: x + cw / 2, y: y + 58, text: app === 'me' ? label : nm(app), size: 12, color: '#ffffff', anchor: 'middle', maxWidth: cw - 4, font: 'win', shadow: 'desktop' });
  }
  // The same icon as "Large icons".
  const lx = 430, ly = 40;
  nodes.push({ t: 'icon', app: 'me', x: lx, y: ly, size: 96 });
  nodes.push({ t: 'text', x: lx + 48, y: ly + 106, text: label, size: 12, color: '#ffffff', anchor: 'middle', maxWidth: 120, font: 'win', shadow: 'desktop' });
  nodes.push({ t: 'text', x: lx + 48, y: ly + 150, text: 'Large icons (96 px)', size: 11, color: 'rgba(255,255,255,0.7)', anchor: 'middle', font: 'win' });
  return { width: W, height: H, nodes };
}

function explorer({ theme, id, label, nm }) {
  const dark = theme !== 'light';
  const t = dark
    ? { frame: '#1c1c1c', tab: '#2b2b2b', body: '#191919', bar: '#242424', text: '#ffffff', sub: '#c5c5c5', line: 'rgba(255,255,255,0.07)', field: '#2b2b2b', sel: 'rgba(96,205,255,0.17)', selEdge: 'rgba(96,205,255,0.35)', navSel: 'rgba(255,255,255,0.07)', accent: '#60cdff' }
    : { frame: '#e8edf2', tab: '#f9f9f9', body: '#ffffff', bar: '#f9f9f9', text: '#1b1b1b', sub: '#5d5d5d', line: 'rgba(0,0,0,0.07)', field: '#ffffff', sel: '#cce4f7', selEdge: '#99c9ef', navSel: 'rgba(0,0,0,0.05)', accent: '#005fb8' };
  const W = 720, H = 420, nodes = [];
  let body = `<rect width="${W}" height="${H}" rx="8" fill="${t.frame}"/>`;
  // Tab strip.
  body += `<path d="M8 40v-28a8 8 0 0 1 8 -8h200a8 8 0 0 1 8 8v28z" fill="${t.tab}"/>` + stroke('M200 17l7 7M207 17l-7 7', t.sub, 1.1) + stroke('M244 21h10M249 16v10', t.sub, 1.2);
  body += windowButtons(W, 21, t.text);
  // Command bar and address row.
  body += rect(0, 40, W, 92, t.tab) + rect(0, 86, W, 1, t.line) + rect(0, 132, W, 1, t.line);
  body += rect(12, 50, 68, 28, dark ? 'rgba(255,255,255,0.06)' : '#ffffff', 4, ` stroke="${t.line}"`) + stroke('M24 64h10M29 59v10', t.text, 1.3);
  // Command glyphs, drawn on a 16 px grid: cut, copy, paste, rename, share, delete.
  const glyphs = [
    'M3 1l8 9M13 1l-8 9M6.4 13a2.4 2.4 0 1 1 -4.8 0a2.4 2.4 0 1 1 4.8 0M14.4 13a2.4 2.4 0 1 1 -4.8 0a2.4 2.4 0 1 1 4.8 0',
    'M6.5 1h7a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1 -1.5 1.5h-7a1.5 1.5 0 0 1 -1.5 -1.5v-8a1.5 1.5 0 0 1 1.5 -1.5M2 4.5v9a1.5 1.5 0 0 0 1.5 1.5h7',
    'M5 2.5h-1.5a1.5 1.5 0 0 0 -1.5 1.5v10a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5 -1.5v-10a1.5 1.5 0 0 0 -1.5 -1.5h-1.5M5.5 1h5v3h-5z',
    'M7 4h-5v8h5M11 4h3v8h-3M9 1v14M7 1h4M7 15h4',
    'M8 10v-9M5 4l3 -3l3 3M5 7h-2v8h10v-8h-2',
    'M2 4h12M6 4v-2h4v2M3.5 4l1 11h7l1 -11',
  ];
  body += glyphs.map((d, i) => `<g transform="translate(${104 + i * 32} 56)">${stroke(d, t.text, 1.1)}</g>`).join('');
  body += rect(296, 54, 1, 20, t.line);
  // Address: back, forward, up, refresh, breadcrumb, search.
  body += stroke('M22 109h12M22 109l5 -5M22 109l5 5', t.sub, 1.2) + stroke('M60 109h12M72 109l-5 -5M72 109l-5 5', t.sub, 1.2) + stroke('M102 115v-12M102 103l-5 5M102 103l5 5', t.sub, 1.2) + stroke('M134 103a6 6 0 1 0 4 2M138 101v4h-4', t.sub, 1.2);
  body += rect(160, 95, 380, 28, t.field, 4, ` stroke="${t.line}"`) + rect(548, 95, 160, 28, t.field, 4, ` stroke="${t.line}"`) + searchGlyph(686, 103, 11, t.sub);
  // Body: nav pane, details.
  body += rect(0, 133, W, H - 133 - 26, t.body) + rect(188, 133, 1, H - 159, t.line);
  body += rect(8, 176, 172, 28, t.navSel, 4) + rect(8, 182, 3, 16, t.accent, 1.5);
  body += rect(204, 133 + 8, W - 216, 26, 'none') + rect(204, 166, W - 216, 1, t.line);
  // Selected row (ours).
  body += rect(204, 172, W - 216, 30, t.sel, 4, ` stroke="${t.selEdge}"`);
  body += `<path d="M0 ${H - 26}h${W}v18a8 8 0 0 1 -8 8h-${W - 16}a8 8 0 0 1 -8 -8z" fill="${t.bar}"/>` + rect(0, H - 26, W, 1, t.line);
  nodes.push({ t: 'svg', body });
  nodes.push({ t: 'icon', app: 'explorer', x: 18, y: 14, size: 16 });
  nodes.push({ t: 'text', x: 42, y: 15, text: 'Desktop', size: 12, color: t.text, font: 'win' });
  nodes.push({ t: 'text', x: 40, y: 57, text: 'New', size: 12, color: t.text, font: 'win' });
  nodes.push({ t: 'text', x: 312, y: 57, text: 'Sort', size: 12, color: t.text, font: 'win' });
  nodes.push({ t: 'text', x: 362, y: 57, text: 'View', size: 12, color: t.text, font: 'win' });
  nodes.push({ t: 'text', x: 172, y: 102, text: 'This PC', size: 12, color: t.text, font: 'win' });
  nodes.push({ t: 'text', x: 222, y: 102, text: '›', size: 12, color: t.sub, font: 'win' });
  nodes.push({ t: 'text', x: 236, y: 102, text: 'Desktop', size: 12, color: t.text, font: 'win' });
  nodes.push({ t: 'text', x: 558, y: 102, text: 'Search Desktop', size: 12, color: t.sub, font: 'win' });
  const nav = [['Home', 148], ['Desktop', 182], ['Downloads', 216], ['Documents', 250], ['Pictures', 284], ['This PC', 330]];
  for (const [name, y] of nav) {
    nodes.push({ t: 'icon', app: name === 'This PC' ? 'thispc' : 'explorer', x: 22, y: y, size: 16 });
    nodes.push({ t: 'text', x: 46, y: y + 1, text: name, size: 12, color: t.text, font: 'win' });
  }
  for (const [x, h] of [[232, 'Name'], [452, 'Date modified'], [580, 'Type'], [666, 'Size']]) nodes.push({ t: 'text', x, y: 145, text: h, size: 12, color: t.sub, font: 'win' });
  const rows = ['me', 'edge', 'spotify', 'discord', 'telegram', 'vscode'].map((app) => [app, app === 'me' ? label : nm(app)]);
  rows.forEach(([app, name], k) => {
    const y = 172 + k * 30;
    nodes.push({ t: 'icon', app, x: 212, y: y + 7, size: 16 });
    nodes.push({ t: 'text', x: 236, y: y + 8, text: name, size: 12, color: t.text, font: 'win', maxWidth: 200 });
    nodes.push({ t: 'text', x: 452, y: y + 8, text: `10/${29 - k}/2026 ${[9, 10, 11, 12, 1, 4][k]}:${k}2 ${k < 3 ? 'AM' : 'PM'}`, size: 12, color: t.sub, font: 'win' });
    nodes.push({ t: 'text', x: 580, y: y + 8, text: 'Shortcut', size: 12, color: t.sub, font: 'win' });
    nodes.push({ t: 'text', x: 666, y: y + 8, text: `${2 + (k % 2)} KB`, size: 12, color: t.sub, font: 'win' });
  });
  nodes.push({ t: 'text', x: 16, y: H - 20, text: '6 items', size: 12, color: t.sub, font: 'win' });
  nodes.push({ t: 'text', x: 80, y: H - 20, text: '1 item selected  2.15 KB', size: 12, color: t.sub, font: 'win' });
  return { width: W, height: H, nodes };
}

function browserBand(nodes, y0, W, dark, label) {
  const t = dark
    ? { strip: '#1f1f1f', tab: '#3c3c3c', text: '#e8eaed', sub: '#9aa0a6', sep: '#4a4a4a', omni: '#282828', glyph: '#c4c7c5' }
    : { strip: '#dfe3e8', tab: '#ffffff', text: '#1f1f1f', sub: '#5f6368', sep: '#b8bec6', omni: '#eef1f4', glyph: '#474747' };
  const stripH = 40, barH = 44;
  let body = rect(0, y0, W, stripH, t.strip) + rect(0, y0 + stripH, W, barH, t.tab);
  // Active tab, flared into the toolbar.
  const ax = 8, aw = 240, ty = y0 + 6;
  body += `<path d="M${ax - 8} ${y0 + stripH}a8 8 0 0 0 8 -8v-18a8 8 0 0 1 8 -8h${aw - 16}a8 8 0 0 1 8 8v18a8 8 0 0 0 8 8z" fill="${t.tab}"/>`;
  body += stroke(`M${ax + aw - 26} ${ty + 12}l7 7M${ax + aw - 19} ${ty + 12}l-7 7`, t.sub, 1.2);
  // Inactive tabs and the new-tab button.
  body += rect(ax + aw + 12, ty + 9, 1, 18, t.sep) + rect(ax + aw * 2 - 14, ty + 9, 1, 18, t.sep);
  body += stroke(`M${ax + aw * 2 + 6} ${ty + 17}h12M${ax + aw * 2 + 12} ${ty + 11}v12`, t.sub, 1.3);
  body += windowButtons(W, y0 + 20, t.text);
  // Toolbar: back, forward, reload, omnibox, profile.
  const by = y0 + stripH;
  body += stroke(`M18 ${by + 22}h12M18 ${by + 22}l5 -5M18 ${by + 22}l5 5`, t.glyph, 1.4) + stroke(`M50 ${by + 22}h12M62 ${by + 22}l-5 -5M62 ${by + 22}l-5 5`, t.sub, 1.4) + stroke(`M90 ${by + 16}a6.5 6.5 0 1 0 4 2.5M94.5 ${by + 13}v5h-5`, t.glyph, 1.4);
  body += rect(114, by + 6, W - 170, 32, t.omni, 16) + `<rect x="128" y="${by + 17}" width="9" height="8" rx="1.5" fill="none" stroke="${t.sub}" stroke-width="1.2"/>` + stroke(`M130 ${by + 17}v-2.5a2.5 2.5 0 0 1 5 0v2.5`, t.sub, 1.2);
  body += `<circle cx="${W - 32}" cy="${by + 22}" r="11" fill="${dark ? '#8ab4f8' : '#1a73e8'}"/>`;
  nodes.push({ t: 'svg', body });
  nodes.push({ t: 'icon', app: 'me', x: ax + 12, y: ty + 10, size: 16 });
  nodes.push({ t: 'text', x: ax + 36, y: ty + 11, text: label, size: 12, color: t.text, font: 'chrome', maxWidth: aw - 76 });
  nodes.push({ t: 'icon', app: 'github', x: ax + aw + 26, y: ty + 10, size: 16 });
  nodes.push({ t: 'text', x: ax + aw + 50, y: ty + 11, text: 'GitHub', size: 12, color: t.sub, font: 'chrome', maxWidth: aw - 80 });
  nodes.push({ t: 'text', x: 146, y: by + 15, text: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'myapp'}.com`, size: 13, color: t.text, font: 'chrome', maxWidth: W - 230 });
  return stripH + barH;
}

function browser({ theme, label }) {
  const W = 720, nodes = [];
  const themes = theme === 'both' ? [true, false] : [theme !== 'light'];
  let y = 0;
  for (const dark of themes) y += browserBand(nodes, y, W, dark, label);
  return { width: W, height: y, nodes };
}

function dock({ id, label }) {
  const W = 640, H = 210, nodes = [];
  const apps = ['msafari', 'mvscode', 'me', 'mspot', 'mfigma', 'mslack'];
  const size = 56, gap = 8, pad = 8;
  const dw = apps.length * size + (apps.length - 1) * gap + pad * 2 + 22 + size, dx = Math.round((W - dw) / 2), dy = H - size - pad * 2 - 6;
  let body = macWall(W, H, id('w'));
  body += `<rect x="${dx}" y="${dy}" width="${dw}" height="${size + pad * 2}" rx="20" fill="rgba(246,246,250,0.36)" stroke="rgba(255,255,255,0.45)"/>`;
  // Separator before the trash.
  const sepX = dx + pad + apps.length * (size + gap) + 4;
  body += rect(sepX, dy + 12, 1, size - 8, 'rgba(255,255,255,0.5)');
  // Trash: a simple wire bin.
  const tx = sepX + 15, ty = dy + pad;
  body += `<defs><linearGradient id="${id('t')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9dde4"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="1" stop-color="#c9ced7"/></linearGradient></defs>` +
    `<path d="M${tx + 9} ${ty + 12}h${size - 18}l-3 ${size - 16}a4 4 0 0 1 -4 3.5h${-(size - 32)}a4 4 0 0 1 -4 -3.5z" fill="url(#${id('t')})" opacity="0.92"/>` +
    `<ellipse cx="${tx + size / 2}" cy="${ty + 12}" rx="${(size - 18) / 2}" ry="3.2" fill="#eef0f4" stroke="#b8bec8" stroke-width="0.8"/>` +
    stroke(`M${tx + 20} ${ty + 18}l1 ${size - 26}M${tx + size / 2} ${ty + 18}v${size - 26}M${tx + size - 20} ${ty + 18}l-1 ${size - 26}`, 'rgba(140,146,156,0.5)', 1);
  // Running dots and the name tooltip above our icon.
  const mine = apps.indexOf('me'), mx = dx + pad + mine * (size + gap) + size / 2;
  for (const k of [0, 1, mine]) body += `<circle cx="${dx + pad + k * (size + gap) + size / 2}" cy="${dy + size + pad + 4}" r="2" fill="rgba(30,30,35,0.75)"/>`;
  const tipW = Math.min(220, Math.max(64, label.length * 7.4 + 24));
  body += `<rect x="${r1(mx - tipW / 2)}" y="${dy - 40}" width="${r1(tipW)}" height="26" rx="7" fill="rgba(40,40,46,0.82)" stroke="rgba(255,255,255,0.12)"/>`;
  nodes.push({ t: 'svg', body });
  nodes.push({ t: 'text', x: mx, y: dy - 34, text: label, size: 13, color: '#ffffff', anchor: 'middle', font: 'mac', maxWidth: tipW - 16 });
  apps.forEach((app, k) => {
    const x = dx + pad + k * (size + gap);
    // macOS app icons keep a margin inside their square; ours is drawn as the file would be.
    if (app === 'me') nodes.push({ t: 'icon', app, x, y: dy + pad, size, shadow: true });
    else nodes.push({ t: 'icon', app, x: x + 5, y: dy + pad + 5, size: size - 10, mask: 'mac', shadow: true });
  });
  return { width: W, height: H, nodes };
}

function phoneStatus(nodes, W, color, font) {
  nodes.push({ t: 'text', x: font === 'android' ? 22 : 46, y: 15, text: '9:41', size: font === 'android' ? 13 : 15, weight: 600, color, anchor: font === 'android' ? 'start' : 'middle', font });
  const x = W - (font === 'android' ? 64 : 88);
  let b = '';
  for (let i = 0; i < 4; i++) b += rect(x + i * 5, 24 - (i + 1) * 2.6, 3, (i + 1) * 2.6, color, 0.8);
  b += wifiGlyph(x + 24, 9, color).replace(/stroke-width="1.4"/g, 'stroke-width="1.8"');
  b += font === 'android'
    ? rect(x + 46, 11, 9, 14, 'none', 2, ` stroke="${color}" stroke-width="1.3"`) + rect(x + 48, 15, 5, 8, color, 1)
    : rect(x + 46, 12, 24, 12, 'none', 3.5, ` stroke="${color}" stroke-opacity="0.45" stroke-width="1"`) + rect(x + 48, 14, 17, 8, color, 2) + rect(x + 71, 16, 1.6, 4, color, 0.8, ' opacity="0.45"');
  nodes.push({ t: 'svg', body: b });
}

function ios({ id, label, nm }) {
  const W = 393, H = 452, nodes = [];
  nodes.push({ t: 'svg', body: `<defs><linearGradient id="${id('w')}" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="#1e3c72"/><stop offset="0.5" stop-color="#6a4c93"/><stop offset="1" stop-color="#f08a5d"/></linearGradient></defs>` + rect(0, 0, W, H, `url(#${id('w')})`) });
  phoneStatus(nodes, W, '#ffffff', 'ios');
  const grid = [['photos', 'maps', 'me', 'youtube'], ['gmail', 'netflix', 'appstore', 'mspotify']];
  const size = 62, pitchX = 86, x0 = Math.round((W - (3 * pitchX + size)) / 2);
  grid.forEach((row, r) => row.forEach((app, k) => {
    const x = x0 + k * pitchX, y = 72 + r * 104;
    nodes.push({ t: 'icon', app, x, y, size, mask: 'ios' });
    nodes.push({ t: 'text', x: x + size / 2, y: y + size + 6, text: app === 'me' ? label : nm(app), size: 12, color: '#ffffff', anchor: 'middle', maxWidth: 78, font: 'ios', shadow: 'ios' });
  }));
  // Page dots, dock, home indicator.
  let b = `<circle cx="${W / 2 - 6}" cy="${H - 128}" r="3.5" fill="#ffffff"/><circle cx="${W / 2 + 6}" cy="${H - 128}" r="3.5" fill="#ffffff" opacity="0.4"/>`;
  b += rect(12, H - 110, W - 24, 92, 'rgba(255,255,255,0.22)', 30, ' stroke="rgba(255,255,255,0.18)"');
  b += rect(W / 2 - 67, H - 9, 134, 5, '#ffffff', 2.5);
  nodes.push({ t: 'svg', body: b });
  ['messages', 'safari', 'music', 'mwhatsapp'].forEach((app, k) => nodes.push({ t: 'icon', app, x: x0 + k * pitchX, y: H - 95, size, mask: 'ios' }));
  return { width: W, height: H, nodes };
}

function android({ id, label, nm }) {
  const W = 412, H = 520, nodes = [];
  nodes.push({ t: 'svg', body: `<defs><radialGradient id="${id('w')}" cx="0.2" cy="0.15" r="1"><stop offset="0" stop-color="#3f6656"/><stop offset="0.6" stop-color="#1d3329"/><stop offset="1" stop-color="#121c17"/></radialGradient></defs>` + rect(0, 0, W, H, `url(#${id('w')})`) +
    `<circle cx="${W - 40}" cy="${H * 0.42}" r="150" fill="#2c4a3d" opacity="0.55"/>` });
  phoneStatus(nodes, W, '#ffffff', 'android');
  nodes.push({ t: 'text', x: 24, y: 58, text: 'Wed, Oct 29', size: 22, color: '#ffffff', font: 'android' });
  nodes.push({ t: 'text', x: 24, y: 90, text: '☁  18°C  Partly cloudy', size: 13, color: 'rgba(255,255,255,0.85)', font: 'android' });
  const grid = [['photos', 'maps', 'me', 'youtube'], ['gmail', 'netflix', 'mspotify', 'mwhatsapp']];
  const size = 56, pitchX = 92, x0 = Math.round((W - (3 * pitchX + size)) / 2);
  grid.forEach((row, r) => row.forEach((app, k) => {
    const x = x0 + k * pitchX, y = 150 + r * 102;
    nodes.push({ t: 'icon', app, x, y, size, mask: 'android' });
    nodes.push({ t: 'text', x: x + size / 2, y: y + size + 8, text: app === 'me' ? label : nm(app), size: 12, color: '#ffffff', anchor: 'middle', maxWidth: 84, font: 'android', shadow: 'ios' });
  }));
  // Dock row and the search pill.
  ['messages', 'photos', 'maps', 'mspotify'].forEach((app, k) => nodes.push({ t: 'icon', app, x: x0 + k * pitchX, y: H - 150, size, mask: 'android' }));
  let b = rect(20, H - 72, W - 40, 50, 'rgba(214,232,222,0.16)', 25);
  const gx = 46, gy = H - 47;
  b += `<path d="M${gx + 8} ${gy}a8 8 0 1 1 -2.3 -5.6" fill="none" stroke="#4285f4" stroke-width="3"/>` + rect(gx, gy - 1.5, 8, 3, '#4285f4');
  b += `<rect x="${W - 66}" y="${gy - 8}" width="7" height="12" rx="3.5" fill="none" stroke="#ffffff" stroke-width="1.6"/>` + stroke(`M${W - 69} ${gy + 1}a5.5 5.5 0 0 0 13 0M${W - 62.5} ${gy + 7}v3`, '#ffffff', 1.6);
  b += rect(W / 2 - 54, H - 8, 108, 4, 'rgba(255,255,255,0.75)', 2);
  nodes.push({ t: 'svg', body: b });
  return { width: W, height: H, nodes };
}

function sizes() {
  const list = [16, 20, 24, 32, 48], W = 520, rowH = 84, nodes = [];
  nodes.push({ t: 'svg', body: rect(0, 0, W, rowH, '#1f1f1f') + rect(0, rowH, W, rowH, '#f3f3f3') });
  [['#bdbdbd', 0], ['#5d5d5d', 1]].forEach(([color, row]) => {
    let x = 18;
    for (const px of list) {
      nodes.push({ t: 'pixels', x, y: row * rowH + 10 + (48 - px) / 2, px, zoom: 1 });
      nodes.push({ t: 'text', x: x + px / 2, y: row * rowH + 64, text: String(px), size: 11, color, anchor: 'middle' });
      x += px + 20;
    }
    nodes.push({ t: 'svg', body: rect(300, row * rowH + 10, 1, 64, row ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)') });
    for (const [zx, px, z] of [[330, 16, 3], [410, 24, 2]]) {
      nodes.push({ t: 'pixels', x: zx, y: row * rowH + 10, px, zoom: z });
      nodes.push({ t: 'text', x: zx + (px * z) / 2, y: row * rowH + 64, text: `${px} px, ×${z}`, size: 11, color, anchor: 'middle' });
    }
  });
  return { width: W, height: rowH * 2, nodes };
}

const BUILD = { taskbar, start, desktop, explorer, browser, dock, ios, android, sizes };

/**
 * Lay out one scene. o: label (the app name), theme ('dark' | 'light' | 'both' where supported),
 * prefix (makes gradient ids unique when several scenes share one page), names ({ appKey: name } overrides).
 */
export function buildScene(name, { label = 'My App', theme, prefix = 'iw', names = {} } = {}) {
  const build = BUILD[name];
  if (!build) throw new Error(`unknown scene: ${name} (use ${SCENES.join(', ')})`);
  const id = (n) => `${prefix}-${name}-${n}`;
  const nm = (app) => names[app] ?? APPS[app]?.name ?? app;
  const scene = build({ label: String(label || 'My App').slice(0, 40), theme: theme ?? THEMED[name], id, nm });
  scene.name = name;
  return scene;
}

export { FONT };
