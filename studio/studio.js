// iconwright studio: pick artwork, shape the look, see it where it lives, download or apply.
// Everything on screen is drawn in the browser (engine.js) from the same recipes the server uses,
// so edits are instant and match the files. The server is only used for search, local artwork,
// downloads and (on Windows) applying icons.
import { parseStyle, formatStyle, normalizeStyle } from './shared/style.mjs';
import { SCENES, TITLES, THEMED, DEFAULT_SCENES } from './shared/scenes.mjs';
import { loadArt, Icon, neighborIcon, drawScene, retarget, sceneApps } from './engine.js';

const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.search).get('t');
const dpr = Math.min(3, Math.max(1, Math.round((window.devicePixelRatio || 1) * 2) / 2));

// ---------- state ----------
// The design: source + style options (the same keys as a style string) + the app name.
const state = { source: '', style: {}, label: 'My App', name: 'icon' };
// Values remembered while a mode is off, so switching back restores them.
const memo = { color: '#ffffff', bg: '#2d5ba6', g1: '#7b3f92', g2: '#2d5ba6', angle: 135, shape: 'squircle' };
let info = { local: false, windows: false };
let art = null, icon = null;

const store = {
  get(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};
const view = {
  scenes: new Set(store.get('iconwright.scenes', DEFAULT_SCENES).filter((s) => SCENES.includes(s))),
  themes: store.get('iconwright.themes', {}),
};
if (!view.scenes.size) DEFAULT_SCENES.forEach((s) => view.scenes.add(s));

// ---------- server ----------
const isRaw = (s) => typeof s === 'string' && s.trim().startsWith('<');
async function api(op, data = {}, { as = 'json', post = false } = {}) {
  const headers = token ? { 'x-iconwright-token': token } : {};
  let res;
  if (post || isRaw(data.source)) {
    res = await fetch(`/api/${op}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(data) });
  } else {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
      if (v == null || v === '') continue;
      if (Array.isArray(v)) v.forEach((x) => q.append(k, x)); else q.set(k, v);
    }
    res = await fetch(`/api/${op}?${q}`, { headers });
  }
  if (!res.ok) {
    let msg = res.statusText || `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return as === 'blob' ? res.blob() : res.json();
}

// ---------- messages ----------
let toastTimer = 0;
function status(msg = '', error = false) {
  const t = $('status');
  clearTimeout(toastTimer);
  t.textContent = msg; t.classList.toggle('error', error); t.classList.toggle('show', !!msg);
  if (msg) toastTimer = setTimeout(() => t.classList.remove('show'), error ? 6000 : 2600);
}

// ---------- history ----------
const snap = () => JSON.stringify({ source: state.source, style: state.style });
const past = [], future = [];
let committed = null;
function commit() {
  const s = snap();
  if (s === committed) return;
  if (committed !== null) { past.push(committed); if (past.length > 100) past.shift(); future.length = 0; }
  committed = s;
  updateHistoryButtons(); saveHash();
}
function restore(s) {
  const v = JSON.parse(s);
  const sourceChanged = v.source !== state.source;
  state.source = v.source; state.style = v.style;
  committed = s;
  syncControls(); updateHistoryButtons(); saveHash();
  if (sourceChanged) setSource(state.source, { record: false }); else schedule();
}
function undo() { if (!past.length) return; future.push(committed); restore(past.pop()); }
function redo() { if (!future.length) return; past.push(committed); restore(future.pop()); }
function updateHistoryButtons() { $('undo').disabled = !past.length; $('redo').disabled = !future.length; }

// ---------- style helpers ----------
const GRAD = /^linear-gradient\(\s*(-?[\d.]+)deg\s*,\s*([^,()]+|rgba?\([^)]*\))\s*,\s*([^,()]+|rgba?\([^)]*\))\s*\)$/i;
const bgMode = () => !state.style.bg ? 'none' : GRAD.test(state.style.bg) ? 'gradient' : 'solid';
const toHex = (c) => {
  const probe = document.createElement('canvas').getContext('2d');
  probe.fillStyle = '#000'; probe.fillStyle = String(c).trim();
  return /^#[0-9a-f]{6}$/i.test(probe.fillStyle) ? probe.fillStyle : null;
};
function setStyle(patch, { record = true } = {}) {
  const next = { ...state.style, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === null || next[k] === false) delete next[k];
  try { normalizeStyle(next); } catch (e) { return status(e.message, true); }
  state.style = next;
  syncControls(); schedule();
  if (record) commit();
}
const gradient = () => `linear-gradient(${memo.angle}deg,${memo.g1},${memo.g2})`;

// ---------- drawing ----------
let frame = 0, drawSeq = 0;
function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; draw(); });
}
async function draw() {
  if (!art) return;
  const seq = ++drawSeq;
  let next;
  try { next = await Icon.create(art, state.style); } catch (e) { return status(e.message, true); }
  if (seq !== drawSeq) { next.dispose(); return; }
  icon?.dispose(); icon = next;
  $('big').src = icon.url;
  $('canvas').classList.add('ready');
  drawMiniSizes();
  drawGallery();
  updateCode();
}
function drawMiniSizes() {
  const box = $('miniSizes');
  box.replaceChildren();
  for (const theme of ['dark', 'light']) {
    const strip = document.createElement('div');
    strip.className = `strip ${theme}`;
    for (const px of [16, 20, 24, 32]) {
      const cell = document.createElement('span');
      const img = document.createElement('img');
      img.src = icon.raster(px); img.width = px; img.height = px; img.alt = '';
      cell.append(img, Object.assign(document.createElement('small'), { textContent: px }));
      strip.append(cell);
    }
    box.append(strip);
  }
}

// ---------- scenes ----------
const nIcons = {};
function ensureNeighbors() {
  for (const name of view.scenes) for (const key of sceneApps(name)) {
    if (key in nIcons) continue;
    nIcons[key] = null;
    neighborIcon(key).then((i) => { nIcons[key] = i; schedule(); });
  }
}
function sceneTheme(name) { return view.themes[name] ?? THEMED[name]; }
function drawGallery() {
  if (!icon) return;
  ensureNeighbors();
  const icons = { ...nIcons, me: icon };
  const gallery = $('gallery');
  const wanted = SCENES.filter((s) => view.scenes.has(s));
  // Keep cards in place; only their drawing changes.
  for (const card of [...gallery.children]) if (!view.scenes.has(card.dataset.scene)) card.remove();
  wanted.forEach((name, i) => {
    let card = gallery.querySelector(`[data-scene="${name}"]`);
    if (!card) card = makeCard(name);
    if (gallery.children[i] !== card) gallery.insertBefore(card, gallery.children[i] ?? null);
    // Re-lay out only when something other than the icon's look changed.
    const body = card.querySelector('.scene-body');
    const key = [state.label, sceneTheme(name), sceneApps(name).filter((k) => nIcons[k]).length,
      name === 'android' || name === 'ios' ? icon.hasClearCorners() : '', name === 'android' ? icon.plateColor() : ''].join('|');
    if (body.dataset.key === key && body.firstElementChild) { retarget(body, icon); return; }
    const scene = drawScene(name, { label: state.label, theme: sceneTheme(name) }, icons);
    body.dataset.key = key;
    // Wide scenes keep at least 70% of their real size and scroll, centered, on narrow screens.
    body.style.setProperty('--minw', `${Math.round(scene.width * 0.7)}px`);
    body.innerHTML = scene.svg;
    card.classList.toggle('tall', scene.height > scene.width);
    requestAnimationFrame(() => { body.scrollLeft = (body.scrollWidth - body.clientWidth) / 2; });
  });
  updateHints();
}
function makeCard(name) {
  const card = document.createElement('article');
  card.className = 'scene-card'; card.dataset.scene = name;
  const head = document.createElement('header');
  const h = document.createElement('h3'); h.textContent = TITLES[name];
  head.append(h);
  if (THEMED[name]) {
    const seg = document.createElement('div');
    seg.className = 'seg tiny'; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', `${TITLES[name]} theme`);
    const options = THEMED[name] === 'both' ? [['both', 'Both'], ['dark', 'Dark'], ['light', 'Light']] : [['dark', 'Dark'], ['light', 'Light']];
    for (const [v, text] of options) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = v; b.textContent = text;
      b.setAttribute('aria-checked', String(sceneTheme(name) === v));
      b.onclick = () => {
        view.themes[name] = v; store.set('iconwright.themes', view.themes);
        for (const o of seg.children) o.setAttribute('aria-checked', String(o === b));
        drawGallery();
      };
      seg.append(b);
    }
    head.append(seg);
  }
  const zoom = document.createElement('button');
  zoom.type = 'button'; zoom.className = 'icon-btn small'; zoom.title = 'Enlarge'; zoom.setAttribute('aria-label', `Enlarge ${TITLES[name]}`);
  zoom.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  zoom.onclick = () => openZoom(name);
  head.append(zoom);
  const body = document.createElement('div');
  body.className = 'scene-body'; body.onclick = () => openZoom(name);
  const hint = document.createElement('p');
  hint.className = 'scene-hint'; hint.hidden = true;
  card.append(head, body, hint);
  return card;
}
function openZoom(name) {
  const scene = drawScene(name, { label: state.label, theme: sceneTheme(name) }, { ...nIcons, me: icon });
  $('zoomTitle').textContent = TITLES[name];
  $('zoomBody').innerHTML = scene.svg;
  $('zoomBody').style.aspectRatio = `${scene.width} / ${scene.height}`;
  $('zoomBody').style.maxWidth = `${Math.min(scene.width * 2, 1400)}px`;
  $('zoomDlg').showModal();
}
// Plain-language warnings where a platform will treat the icon differently.
function updateHints() {
  const clear = icon?.hasClearCorners();
  const hints = {
    ios: clear ? 'iOS fills see-through corners with black. Add a square background for iPhone.' : '',
    android: clear ? 'Android puts icons with see-through corners on a plate, smaller.' : '',
    dock: 'macOS app icons usually leave a margin around a rounded square (about 10% each side).',
  };
  for (const card of $('gallery').children) {
    const hint = card.querySelector('.scene-hint'), text = hints[card.dataset.scene] || '';
    hint.textContent = text; hint.hidden = !text;
  }
}
function buildSceneChips() {
  const box = $('sceneChips');
  for (const name of SCENES) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = TITLES[name]; b.setAttribute('aria-pressed', String(view.scenes.has(name)));
    b.onclick = () => {
      if (view.scenes.has(name)) { if (view.scenes.size > 1) view.scenes.delete(name); } else view.scenes.add(name);
      b.setAttribute('aria-pressed', String(view.scenes.has(name)));
      store.set('iconwright.scenes', [...view.scenes]);
      drawGallery();
    };
    box.append(b);
  }
}

// ---------- artwork ----------
async function setSource(source, { record = true, label } = {}) {
  state.source = source;
  if (label) { state.label = label; $('label').value = label; state.name = label.replace(/[^\w.-]+/g, '-'); $('name').value = state.name; }
  $('sourceName').textContent = isRaw(source) ? 'Your SVG' : source.replace(/^app:/, '');
  $('sourceName').title = isRaw(source) ? '' : source;
  for (const b of document.querySelectorAll('#results button')) b.setAttribute('aria-selected', String(b.dataset.id === source));
  $('canvas').classList.add('busy');
  try {
    const loaded = await loadArt(source, api);
    if (state.source !== source) return;
    art = loaded;
    $('empty').hidden = true;
    if (record) commit(); else saveHash();
    await draw();
    drawIdeas();
  } catch (e) {
    status(e.message, true);
    if (!art) { $('emptyText').textContent = 'Pick an icon to start.'; $('empty').querySelector('.spinner').hidden = true; }
  } finally { $('canvas').classList.remove('busy'); }
}

// Search
let searchSeq = 0, searchStart = 0, lastQuery = '', palette = '';
const SUGGEST = ['music', 'rocket', 'terminal', 'camera', 'chat', 'cloud', 'game', 'mail', 'spotify', 'github'];
async function search(query, { more = false, pickFirst = false } = {}) {
  const seq = ++searchSeq;
  if (!query) {
    $('results').replaceChildren(); $('searchNote').textContent = ''; $('more').hidden = true; $('suggest').hidden = false; lastQuery = '';
    return;
  }
  $('suggest').hidden = true;
  const start = more ? searchStart : 0;
  lastQuery = query;
  $('searchNote').textContent = 'Searching…'; $('more').disabled = true;
  try {
    const r = await api('search', { q: query, limit: 60, start, palette });
    if (seq !== searchSeq) return;
    if (!more) $('results').replaceChildren();
    searchStart = start + r.icons.length;
    for (const id of r.icons) $('results').append(resultButton(id));
    const licenses = [...new Set(Object.values(r.collections ?? {}).map((c) => c.license).filter(Boolean))];
    $('searchNote').textContent = searchStart ? `${searchStart} shown${r.total > searchStart ? ` of ${r.total}` : ''}.${licenses.length ? ` Licenses: ${licenses.join(', ')}.` : ''}` : `Nothing found for “${query}”. Try a simpler word.`;
    $('more').hidden = searchStart >= r.total || !r.icons.length;
    if (pickFirst && r.icons.length) setSource(r.icons[0]);
  } catch (e) {
    if (seq === searchSeq) $('searchNote').textContent = `Search failed: ${e.message}`;
  } finally { if (seq === searchSeq) $('more').disabled = false; }
}
function resultButton(id) {
  const b = document.createElement('button');
  b.type = 'button'; b.title = id; b.dataset.id = id;
  b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(id === state.source));
  const [p, n] = id.split(':');
  const img = document.createElement('img');
  img.alt = id; img.loading = 'lazy'; img.width = 26; img.height = 26;
  img.src = `https://api.iconify.design/${encodeURIComponent(p)}/${encodeURIComponent(n)}.svg`;
  b.append(img);
  b.onclick = () => setSource(id);
  return b;
}

// My apps (local studio on Windows)
let pinned = [];
async function loadApps() {
  const r = await api('apps');
  pinned = r.pinned.filter((a) => a.ok).map((a) => a.name);
  const box = $('apps'); box.replaceChildren();
  for (const name of pinned) {
    const b = document.createElement('button');
    b.type = 'button'; b.title = name; b.dataset.id = `app:${name}`;
    const img = document.createElement('img'); img.alt = '';
    img.src = `/api/appIcon?app=${encodeURIComponent(name)}&size=64&t=${token}`;
    b.append(img, Object.assign(document.createElement('span'), { textContent: name }));
    b.onclick = () => setSource(`app:${name}`, { label: name });
    box.append(b);
  }
}

// ---------- ideas and kept versions ----------
const thumbCache = new Map();
async function thumb(source, style) {
  const key = `${source}|${formatStyle(style)}`;
  if (!thumbCache.has(key)) {
    thumbCache.set(key, loadArt(source, api).then((a) => Icon.create(a, style)).then((i) => i.raster(64 * dpr)));
    if (thumbCache.size > 120) thumbCache.delete(thumbCache.keys().next().value);
  }
  return thumbCache.get(key);
}
const hsl = (h, s, l) => {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12; const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
};
const HUES = [212, 265, 340, 18, 38, 150, 188, 290];
let hueIndex = 0;
function ideaStyles() {
  const h = HUES[hueIndex % HUES.length] + (hueIndex >= HUES.length ? 17 : 0), h2 = (h + 40) % 360;
  return [
    { color: '#ffffff', bg: hsl(h, 62, 44), shape: 'squircle' },
    { color: hsl(h, 70, 42), bg: '#ffffff', shape: 'circle' },
    { color: '#ffffff', bg: `linear-gradient(135deg,${hsl(h, 80, 62)},${hsl(h2, 72, 40)})`, shape: 'rounded', shadow: true },
    { color: hsl((h + 180) % 360, 75, 66), bg: '#1f2228', shape: 'squircle' },
    { bg: hsl(h, 70, 93), shape: 'rounded', radius: 0.3 },
    { color: '#ffffff', bg: 'linear-gradient(180deg,#3a3f47,#15171a)', shape: 'circle' },
    { color: hsl(h, 65, 45) },
    { color: '#1f2228', bg: '#e9c46a', shape: 'squircle' },
  ];
}
async function drawIdeas() {
  if (!state.source) return;
  const source = state.source, styles = ideaStyles();
  const box = $('ideas');
  box.replaceChildren(...styles.map((style) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'listitem'); b.title = formatStyle(style) || 'Original';
    b.setAttribute('aria-label', `Use the style ${b.title}`);
    const img = document.createElement('img'); img.alt = '';
    b.append(img);
    b.onclick = () => { state.style = { ...style }; syncControls(); schedule(); commit(); };
    thumb(source, style).then((url) => { img.src = url; }).catch(() => b.remove());
    return b;
  }));
}
const KEPT = 'iconwright.kept';
function drawKept() {
  const list = store.get(KEPT, []);
  const box = $('kept');
  if (!list.length) { box.innerHTML = '<p class="note">Keep versions to compare them and go back.</p>'; return; }
  box.replaceChildren(...list.map((k, i) => {
    const item = document.createElement('div');
    item.className = 'kept-item'; item.setAttribute('role', 'listitem');
    const use = document.createElement('button');
    use.type = 'button'; use.className = 'use'; use.title = `${k.source}${k.style ? `, ${formatStyle(k.style)}` : ''}`;
    use.setAttribute('aria-label', `Go back to kept version ${i + 1}`);
    const img = document.createElement('img'); img.alt = '';
    use.append(img);
    use.onclick = async () => { state.style = { ...k.style }; syncControls(); if (k.source !== state.source) await setSource(k.source); else { schedule(); commit(); } };
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'del'; del.textContent = '×'; del.setAttribute('aria-label', `Remove kept version ${i + 1}`);
    del.onclick = () => { const l = store.get(KEPT, []); l.splice(i, 1); store.set(KEPT, l); drawKept(); };
    item.append(use, del);
    thumb(k.source, k.style).then((url) => { img.src = url; }).catch(() => item.remove());
    return item;
  }));
}

// ---------- controls ----------
const SWATCHES = ['#ffffff', '#1f2228', '#2d5ba6', '#0a84ff', '#7b3f92', '#e5484d', '#f76b15', '#e9c46a', '#30a46c', '#12a594', '#d6409f', '#8e8c99'];
const GRADIENTS = [['#7b3f92', '#2d5ba6'], ['#e9c46a', '#c47335'], ['#ff7a59', '#d6409f'], ['#5ee7df', '#2d5ba6'], ['#a8e063', '#30a46c'], ['#3a3f47', '#15171a'], ['#f093fb', '#7b3f92'], ['#fdfbfb', '#d5d9df']];
function swatchButton(fill, label, pressed, onclick) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'swatch'; b.style.background = fill; b.title = label;
  b.setAttribute('role', 'radio'); b.setAttribute('aria-label', label); b.setAttribute('aria-checked', String(pressed));
  b.onclick = onclick;
  return b;
}
function syncControls() {
  const st = state.style;
  const custom = !!st.color;
  if (custom) memo.color = toHex(st.color) || memo.color;
  radio($('colorMode'), custom ? 'custom' : 'original');
  $('colorBox').hidden = !custom;
  $('color').value = memo.color; if (document.activeElement !== $('colorText')) $('colorText').value = memo.color;
  $('colorSwatches').replaceChildren(...SWATCHES.map((c) => swatchButton(c, c, custom && memo.color === c, () => { memo.color = c; setStyle({ color: c }); })));

  const mode = bgMode();
  if (mode === 'solid') memo.bg = toHex(st.bg) || memo.bg;
  if (mode === 'gradient') { const g = GRAD.exec(st.bg); memo.angle = Number(g[1]); memo.g1 = toHex(g[2]) || memo.g1; memo.g2 = toHex(g[3]) || memo.g2; }
  radio($('bgMode'), mode);
  $('bgSolid').hidden = mode !== 'solid'; $('bgGradient').hidden = mode !== 'gradient';
  $('bg1').value = memo.bg; if (document.activeElement !== $('bgText')) $('bgText').value = memo.bg;
  $('bgSwatches').replaceChildren(...SWATCHES.map((c) => swatchButton(c, c, mode === 'solid' && memo.bg === c, () => { memo.bg = c; setStyle({ bg: c, shape: st.shape ?? memo.shape }); })));
  $('gradSwatches').replaceChildren(...GRADIENTS.map(([a, b]) => swatchButton(`linear-gradient(135deg,${a},${b})`, `${a} to ${b}`, mode === 'gradient' && memo.g1 === a && memo.g2 === b, () => { memo.g1 = a; memo.g2 = b; setStyle({ bg: gradient(), shape: st.shape ?? memo.shape }); })));
  $('g1').value = memo.g1; $('g2').value = memo.g2; $('angle').value = memo.angle; $('angleOut').value = `${memo.angle}°`;

  const n = normalizeStyle(st);
  $('shapeGroup').hidden = mode === 'none';
  radio($('shape'), n.shape);
  $('radiusRow').hidden = n.shape !== 'rounded';
  $('radius').value = n.radius; $('radiusOut').value = `${Math.round(n.radius * 100)}%`;
  const size = Math.round((1 - 2 * n.padding) * 100);
  $('size').value = size;
  $('sizeOut').value = st.padding == null ? `Auto (${size}%)` : `${size}%`;
  $('sizeAuto').hidden = st.padding == null;
  $('shadow').checked = !!st.shadow;
  updateCode();
}
function updateCode() {
  if (document.activeElement !== $('styleText')) { $('styleText').value = formatStyle(state.style); $('styleText').classList.remove('bad'); }
  $('styleHelp').classList.remove('error');
  $('styleHelp').textContent = 'The same look as text, for agents and the command line. Type to edit.';
}
function radio(group, value) { for (const b of group.children) b.setAttribute('aria-checked', String(b.dataset.v === value || b.dataset.bg === value)); }

// ---------- share ----------
function saveHash() {
  const h = new URLSearchParams();
  if (state.source && (!isRaw(state.source) || state.source.length < 1500)) h.set('source', state.source);
  const st = formatStyle(state.style); if (st) h.set('style', st);
  if (state.label !== 'My App') h.set('label', state.label);
  if (state.name !== 'icon') h.set('name', state.name);
  history.replaceState(null, '', `${location.pathname}${location.search}${h.size ? '#' + h : ''}`);
}
function loadHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('style')) { try { state.style = parseStyle(h.get('style')); } catch (e) { status(`The link's style was ignored: ${e.message}`, true); } }
  if (h.get('label')) { state.label = h.get('label').slice(0, 40); $('label').value = state.label; }
  if (h.get('name')) { state.name = h.get('name').slice(0, 60); $('name').value = state.name; }
  return h.get('source') || '';
}
async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); status(done); }
  catch { window.prompt('Copy this:', text); }
}
function copyForAgent() {
  if (!state.source) return status('Pick an icon first.', true);
  const st = formatStyle(state.style);
  const src = isRaw(state.source) ? 'the SVG below' : `"${state.source}"`;
  let text = `Use iconwright with source ${src}${st ? ` and style "${st}"` : ''}.`;
  if (isRaw(state.source)) text += `\n\n${state.source}`;
  else text += `\nCLI: iconwright make ${state.source}${st ? ` --style "${st}"` : ''}`;
  copyText(text, 'Copied. Paste it to your agent.');
}

// ---------- download and apply ----------
async function download(format, button) {
  if (!state.source) return status('Pick an icon first.', true);
  const all = document.querySelectorAll('[data-format]');
  all.forEach((b) => { b.disabled = true; });
  button.classList.add('working');
  try {
    const name = $('name').value.trim() || 'icon';
    const blob = await api('download', { source: state.source, style: formatStyle(state.style), name, format }, { as: 'blob' });
    const ext = { ico: '.ico', png: '-256.png', icns: '.icns', web: '-web.zip', pngset: '-pngset.zip' }[format];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name.replace(/[^\w.-]+/g, '-') + ext; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    status(`Downloaded ${a.download}.`);
  } catch (e) { status(`Couldn't make the file: ${e.message}`, true); }
  finally { all.forEach((b) => { b.disabled = false; }); button.classList.remove('working'); }
}
function openApply() {
  if (!state.source) return status('Pick an icon first.', true);
  const own = /^app:/i.test(state.source);
  $('ownArtRow').hidden = !own;
  const box = $('applyApps'); box.replaceChildren();
  for (const name of pinned) {
    const row = document.createElement('label'); row.className = 'check';
    const input = Object.assign(document.createElement('input'), { type: 'checkbox', value: name, checked: own && `app:${name}` === state.source });
    row.append(input, document.createTextNode(name));
    box.append(row);
  }
  $('applyDlg').showModal();
}
async function applyToApps() {
  const apps = [...$('applyApps').querySelectorAll('input:checked')].map((i) => i.value);
  if (!apps.length) return status('Tick at least one app.', true);
  $('apply').disabled = true; status(`Applying to ${apps.length} app${apps.length > 1 ? 's' : ''}…`);
  try {
    const own = /^app:/i.test(state.source) && $('ownArt').checked;
    const r = await api('apply', { apps, source: own ? 'app' : state.source, style: formatStyle(state.style) }, { post: true });
    const failed = r.results.filter((x) => x.error);
    status(failed.length ? `Done, except ${failed.map((f) => `${f.app}: ${f.error}`).join('; ')}` : `Applied to ${apps.length} app${apps.length > 1 ? 's' : ''}.${r.hint ? ' Some pinned icons update after Explorer restarts (iconwright refresh).' : ''}`, failed.length > 0);
    if (!failed.length) $('applyDlg').close();
  } catch (e) { status(e.message, true); }
  finally { $('apply').disabled = false; }
}

// ---------- wiring ----------
function wireRadio(group, fn) { for (const b of group.children) b.addEventListener('click', () => fn(b.dataset.v ?? b.dataset.bg, b)); }
function wire() {
  // Artwork tabs
  for (const t of $('sourceTabs').children) t.onclick = () => {
    for (const o of $('sourceTabs').children) o.setAttribute('aria-selected', String(o === t));
    for (const body of document.querySelectorAll('.tab-body')) body.hidden = body.dataset.body !== t.dataset.tab;
  };
  let typeTimer = 0;
  $('searchForm').onsubmit = (e) => { e.preventDefault(); clearTimeout(typeTimer); search($('query').value.trim()); };
  $('query').oninput = () => { clearTimeout(typeTimer); typeTimer = setTimeout(() => search($('query').value.trim()), 280); };
  $('suggest').replaceChildren(...SUGGEST.map((w) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: w });
    b.onclick = () => { $('query').value = w; search(w); };
    return b;
  }));
  wireRadio($('palette'), (v) => { palette = v; radio($('palette'), v); if (lastQuery) search(lastQuery); });
  $('more').onclick = () => search(lastQuery, { more: true });
  $('useSvg').onclick = () => {
    const s = $('svgText').value.trim();
    if (!/^<(\?xml|svg)/i.test(s)) return status('That doesn\'t look like SVG code.', true);
    setSource(s);
  };
  $('svgFile').onchange = async () => { const f = $('svgFile').files[0]; if (f) useFile(f); $('svgFile').value = ''; };

  // Preview
  wireRadio($('canvasBg'), (v) => { $('canvas').dataset.bg = v; radio($('canvasBg'), v); });
  $('shuffle').onclick = () => { hueIndex++; drawIdeas(); };
  $('keep').onclick = () => {
    if (!state.source) return status('Pick an icon first.', true);
    const list = store.get(KEPT, []);
    const entry = { source: isRaw(state.source) && state.source.length > 20000 ? state.source.slice(0, 0) : state.source, style: state.style };
    if (!entry.source) return status('That SVG is too large to keep.', true);
    if (!list.some((k) => k.source === entry.source && formatStyle(k.style) === formatStyle(entry.style))) list.unshift(entry);
    store.set(KEPT, list.slice(0, 12)); drawKept(); status('Kept.');
  };

  // Style
  wireRadio($('colorMode'), (v) => setStyle({ color: v === 'custom' ? memo.color : undefined }));
  $('color').oninput = () => { memo.color = $('color').value; setStyle({ color: memo.color }, { record: false }); };
  $('color').onchange = commit;
  $('colorText').onchange = () => { const h = toHex($('colorText').value); if (h) { memo.color = h; setStyle({ color: h }); } else status('Use a color like #ff8800 or white.', true); };
  wireRadio($('bgMode'), (v) => {
    if (v === 'none') return setStyle({ bg: undefined, shape: undefined, radius: undefined });
    setStyle({ bg: v === 'solid' ? memo.bg : gradient(), shape: state.style.shape && state.style.shape !== 'none' ? state.style.shape : memo.shape });
  });
  $('bg1').oninput = () => { memo.bg = $('bg1').value; setStyle({ bg: memo.bg }, { record: false }); };
  $('bg1').onchange = commit;
  $('bgText').onchange = () => { const h = toHex($('bgText').value); if (h) { memo.bg = h; setStyle({ bg: h }); } else status('Use a color like #2d5ba6 or navy.', true); };
  for (const [id, key] of [['g1', 'g1'], ['g2', 'g2']]) { $(id).oninput = () => { memo[key] = $(id).value; setStyle({ bg: gradient() }, { record: false }); }; $(id).onchange = commit; }
  $('angle').oninput = () => { memo.angle = Number($('angle').value); setStyle({ bg: gradient() }, { record: false }); };
  $('angle').onchange = commit;
  wireRadio($('shape'), (v) => { memo.shape = v; setStyle({ shape: v, radius: v === 'rounded' ? state.style.radius : undefined }); });
  $('radius').oninput = () => setStyle({ radius: Number($('radius').value) }, { record: false });
  $('radius').onchange = commit;
  $('size').oninput = () => setStyle({ padding: Math.round((1 - Number($('size').value) / 100) / 2 * 1000) / 1000 }, { record: false });
  $('size').onchange = commit;
  $('sizeAuto').onclick = () => setStyle({ padding: undefined });
  $('shadow').onchange = () => setStyle({ shadow: $('shadow').checked });
  $('reset').onclick = () => setStyle({ color: undefined, bg: undefined, shape: undefined, radius: undefined, padding: undefined, shadow: undefined });
  let codeTimer = 0;
  $('styleText').oninput = () => {
    clearTimeout(codeTimer);
    codeTimer = setTimeout(() => {
      try {
        const st = parseStyle($('styleText').value);
        normalizeStyle(st);
        state.style = st; $('styleText').classList.remove('bad'); updateCodeHelp(''); syncControls(); schedule();
      } catch (e) { $('styleText').classList.add('bad'); updateCodeHelp(e.message); }
    }, 250);
  };
  $('styleText').onchange = () => { if (!$('styleText').classList.contains('bad')) commit(); };
  $('styleText').onkeydown = (e) => { if (e.key === 'Enter') $('styleText').blur(); };
  $('copyStyle').onclick = () => copyText(formatStyle(state.style) || '(original look)', 'Style code copied.');

  // Scenes
  $('label').oninput = () => { state.label = $('label').value.trim() || 'My App'; drawGallery(); };
  $('label').onchange = saveHash;
  $('name').onchange = () => { state.name = $('name').value.trim() || 'icon'; saveHash(); };

  // Header
  $('undo').onclick = undo; $('redo').onclick = redo;
  $('copyAgent').onclick = copyForAgent;
  $('downloadOpen').onclick = () => { if (!state.source) return status('Pick an icon first.', true); $('downloadDlg').showModal(); };
  for (const b of document.querySelectorAll('[data-format]')) b.onclick = () => download(b.dataset.format, b);
  $('applyOpen').onclick = openApply;
  $('apply').onclick = applyToApps;
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });

  // Phone tabs
  for (const b of document.querySelectorAll('.tabbar button')) b.onclick = () => {
    $('layout').dataset.view = b.dataset.view;
    for (const o of document.querySelectorAll('.tabbar button')) o.setAttribute('aria-current', String(o === b));
    window.scrollTo({ top: 0 });
  };

  // Keyboard
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); }
    else if (e.key === '/' && !typing) { e.preventDefault(); $('query').focus(); }
  });

  // Drag and drop an SVG anywhere.
  let depth = 0;
  window.addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { depth++; $('dropHint').hidden = false; } });
  window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('dropHint').hidden = true; } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); depth = 0; $('dropHint').hidden = true; const f = e.dataTransfer.files[0]; if (f) useFile(f); });
}
function updateCodeHelp(error) {
  $('styleHelp').classList.toggle('error', !!error);
  $('styleHelp').textContent = error || 'The same look as text, for agents and the command line. Type to edit.';
}
async function useFile(file) {
  if (!/svg/i.test(file.type) && !/\.svg$/i.test(file.name)) return status('Only SVG files work here. In the local studio, ask your agent for PNG or ICO files.', true);
  if (file.size > 500_000) return status('That SVG is too large (max 500 KB).', true);
  const text = await file.text();
  $('svgText').value = text;
  setSource(text.trim(), { label: file.name.replace(/\.svg$/i, '') });
}

async function init() {
  wire();
  buildSceneChips();
  drawKept();
  try { info = await api('info'); } catch { /* hosted studio without the API still draws */ }
  if (info.local) { $('mode').hidden = false; $('mode').textContent = info.windows ? 'On this PC' : 'Local'; }
  if (info.windows) {
    $('appsTab').hidden = false; $('applyOpen').hidden = false;
    loadApps().catch((e) => status(e.message, true));
  }
  const source = loadHash();
  syncControls();
  if (source) {
    const related = /^[\w-]+:[\w-]+$/.test(source) && !/^app:/.test(source) ? source.split(':')[1].split('-')[0] : '';
    if (related) { $('query').value = related; search(related); } else search('');
    await setSource(source, { record: false });
    committed = snap();
  } else {
    $('query').value = 'rocket';
    await search('rocket', { pickFirst: true });
  }
}
init();
