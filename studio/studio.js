// iconwright studio: pick artwork, shape the look, see it in context, download or apply.
// Every render goes through the iconwright engine (the local server or the hosted API), so what
// you see is exactly what the MCP tools and the CLI make.
const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.search).get('t');
const SHAPES = ['none', 'square', 'rounded', 'squircle', 'circle'];

const state = {
  source: '', label: 'My App',
  recolor: false, color: '#ffffff',
  bgMode: 'none', bg1: '#2d5ba6', bg2: '#7b3f92', angle: 135,
  shape: 'rounded', radius: 0.22, padding: null, shadow: false,
  scenes: null, scale: 1, canvasBg: 'checker',
};
let info = { local: false, windows: false, scenes: [], defaultScenes: [] };

// ---------- API ----------
const isRaw = (s) => typeof s === 'string' && s.trim().startsWith('<');
async function api(op, data = {}, { as = 'json', signal } = {}) {
  const headers = token ? { 'x-iconwright-token': token } : {};
  let res;
  if (isRaw(data.source) || data.post) {
    res = await fetch(`/api/${op}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(data), signal });
  } else {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
      if (v == null || v === '') continue;
      if (Array.isArray(v)) v.forEach((x) => q.append(k, x)); else q.set(k, v);
    }
    res = await fetch(`/api/${op}?${q}`, { headers, signal });
  }
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return as === 'blob' ? res.blob() : res.json();
}

// ---------- style string <-> controls ----------
function styleString() {
  const parts = [];
  if (state.recolor) parts.push(`color=${state.color}`);
  if (state.bgMode === 'solid') parts.push(`bg=${state.bg1}`);
  if (state.bgMode === 'gradient') parts.push(`bg=linear-gradient(${state.angle}deg,${state.bg1},${state.bg2})`);
  if (state.bgMode !== 'none') {
    parts.push(`shape=${state.shape}`);
    if (state.shape === 'rounded' && state.radius !== 0.22) parts.push(`radius=${state.radius}`);
  }
  if (state.padding != null) parts.push(`padding=${state.padding}`);
  if (state.shadow) parts.push('shadow');
  return parts.join(' ');
}

function tokens(text) {
  const out = []; let depth = 0, cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && !depth) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
const toHex = (c) => {
  const probe = document.createElement('canvas').getContext('2d');
  probe.fillStyle = '#000'; probe.fillStyle = c;
  return /^#[0-9a-f]{6}$/i.test(probe.fillStyle) ? probe.fillStyle : null;
};

const STYLE_KEYS = ['color', 'bg', 'shape', 'radius', 'padding', 'shadow'];
// Problems in a typed style string, in words (empty when it's fine).
function styleProblem(text) {
  const bad = tokens(text).map((t) => t.split('=')[0]).filter((k) => !STYLE_KEYS.includes(k));
  return bad.length ? `Unknown style key: ${bad.join(', ')}. Use ${STYLE_KEYS.join(', ')}.` : '';
}

// Reads a style string into the controls.
function applyStyleString(text) {
  Object.assign(state, { recolor: false, bgMode: 'none', shape: 'rounded', radius: 0.22, padding: null, shadow: false });
  for (const t of tokens(text)) {
    const [k, ...rest] = t.split('='); const v = rest.join('=');
    if (k === 'color') { state.recolor = true; state.color = toHex(v) || state.color; }
    else if (k === 'bg') {
      const g = /^linear-gradient\(\s*(-?[\d.]+)deg\s*,\s*([^,]+?)\s*,\s*([^,]+?)\s*\)$/i.exec(v);
      if (g) Object.assign(state, { bgMode: 'gradient', angle: Number(g[1]), bg1: toHex(g[2]) || state.bg1, bg2: toHex(g[3]) || state.bg2 });
      else { state.bgMode = 'solid'; state.bg1 = toHex(v) || state.bg1; }
    } else if (k === 'shape' && SHAPES.includes(v)) { if (v === 'none') state.bgMode = 'none'; else state.shape = v; }
    else if (k === 'radius') state.radius = Number(v);
    else if (k === 'padding') state.padding = Number(v);
    else if (k === 'shadow') state.shadow = v !== 'false';
  }
}

function syncControls() {
  $('recolor').checked = state.recolor;
  $('color').value = state.color; $('colorText').value = state.color;
  for (const b of $('bgMode').children) b.setAttribute('aria-checked', String(b.dataset.v === state.bgMode));
  $('bgColors').hidden = state.bgMode === 'none';
  $('bg2').hidden = state.bgMode !== 'gradient'; $('angle').hidden = state.bgMode !== 'gradient';
  $('bg1').value = state.bg1; $('bg2').value = state.bg2; $('angle').value = state.angle;
  $('shapeField').hidden = state.bgMode === 'none';
  for (const b of $('shape').children) b.setAttribute('aria-checked', String(b.dataset.v === state.shape));
  $('radiusField').hidden = state.bgMode === 'none' || state.shape !== 'rounded';
  $('radius').value = state.radius; $('radiusOut').value = state.radius;
  $('padding').value = state.padding ?? (state.bgMode === 'none' ? 0.08 : 0.2);
  $('paddingOut').value = state.padding == null ? 'auto' : state.padding;
  $('shadow').checked = state.shadow;
  if (document.activeElement !== $('styleText')) $('styleText').value = styleString();
}

// ---------- rendering ----------
let renderTimer = 0, controller = null;
const objectUrls = new Map();
function setImg(img, blob) {
  const old = objectUrls.get(img);
  if (old) URL.revokeObjectURL(old);
  const url = URL.createObjectURL(blob);
  objectUrls.set(img, url); img.src = url;
}
let toastTimer = 0;
function status(msg = '', error = false) {
  const t = $('status');
  clearTimeout(toastTimer);
  t.textContent = msg; t.classList.toggle('error', error); t.classList.toggle('show', !!msg);
  if (msg) toastTimer = setTimeout(() => t.classList.remove('show'), error ? 6000 : 3000);
}

function changed({ now = false } = {}) {
  syncControls(); saveHash();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, now ? 0 : 220);
}

async function render() {
  if (!state.source) return;
  controller?.abort(); controller = new AbortController();
  const { signal } = controller;
  const style = styleString();
  $('empty').hidden = true; $('canvas').classList.add('busy');
  try {
    const big = api('render', { source: state.source, style, size: 256 }, { as: 'blob', signal });
    const scenes = api('scenes', { source: state.source, style, scenes: [...state.scenes], label: state.label, scale: state.scale }, { as: 'blob', signal });
    setImg($('big'), await big);
    setImg($('scenesImg'), await scenes);
    $('styleText').classList.remove('bad');
  } catch (e) {
    if (e.name === 'AbortError') return;
    status(e.message, true);
    if (/style|color|shape|padding|radius|gradient/i.test(e.message)) $('styleText').classList.add('bad');
  } finally { if (!signal.aborted) $('canvas').classList.remove('busy'); }
}

// ---------- sources ----------
let searchStart = 0, lastQuery = '', searchSeq = 0;
async function search(query, more = false) {
  if (!query) return;
  const seq = ++searchSeq, start = more ? searchStart : 0;   // a newer search makes older answers stale
  if (!more) $('results').replaceChildren();
  lastQuery = query; $('searchNote').textContent = 'Searching…'; $('more').disabled = true;
  const first = !more && !state.source;
  try {
    const r = await api('search', { q: query, limit: 48, start });
    if (seq !== searchSeq) return;
    searchStart = start + r.icons.length;
    for (const id of r.icons) {
      const b = document.createElement('button');
      b.type = 'button'; b.title = id; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(id === state.source));
      const [p, n] = id.split(':');
      b.innerHTML = `<img alt="" loading="lazy" src="https://api.iconify.design/${encodeURIComponent(p)}/${encodeURIComponent(n)}.svg">`;
      b.onclick = () => pickSource(id, b);
      $('results').append(b);
    }
    const licenses = [...new Set(Object.values(r.collections).map((c) => c.license).filter(Boolean))];
    $('searchNote').textContent = r.icons.length || more ? `Showing ${searchStart}${licenses.length ? `. Licenses: ${licenses.join(', ')}` : ''}.` : 'Nothing found. Try a simpler word.';
    $('more').hidden = searchStart >= r.total;
    if (first && r.icons.length) pickSource(r.icons[0], $('results').firstElementChild);
  } catch (e) { if (seq === searchSeq) $('searchNote').textContent = e.message; }
  finally { if (seq === searchSeq) $('more').disabled = false; }
}

function pickSource(source, button, label) {
  state.source = source;
  if (label) { state.label = label; $('label').value = label; $('name').value = label.replace(/[^\w.-]+/g, '-'); }
  for (const b of document.querySelectorAll('.results button')) b.setAttribute('aria-selected', String(b === button));
  changed({ now: true });
}

async function loadApps() {
  const r = await api('apps');
  const box = $('apps'); box.replaceChildren();
  const applyBox = $('applyApps'); applyBox.replaceChildren();
  for (const app of r.pinned.filter((a) => a.ok)) {
    const b = document.createElement('button');
    b.type = 'button'; b.title = app.name;
    const img = document.createElement('img'); img.alt = '';
    img.src = `/api/appIcon?app=${encodeURIComponent(app.name)}&size=64&t=${token}`;
    const span = document.createElement('span'); span.textContent = app.name;
    b.append(img, span);
    b.onclick = () => pickSource(`app:${app.name}`, b, app.name);
    box.append(b);
    const row = document.createElement('label'); row.className = 'check';
    row.innerHTML = '<input type="checkbox">'; row.querySelector('input').value = app.name;
    row.append(document.createTextNode(app.name));
    applyBox.append(row);
  }
}

// ---------- kept versions ----------
const KEPT = 'iconwright.kept';
const kept = () => JSON.parse(localStorage.getItem(KEPT) || '[]');
async function drawKept() {
  const box = $('pinned'); box.replaceChildren();
  for (const [i, k] of kept().entries()) {
    const b = document.createElement('button');
    b.className = 'kept'; b.type = 'button'; b.title = `${k.style || '(original look)'}`;
    const img = document.createElement('img'); img.alt = 'Kept version';
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; x.title = 'Remove';
    b.append(img, x);
    b.onclick = (e) => {
      if (e.target === x) { const list = kept(); list.splice(i, 1); localStorage.setItem(KEPT, JSON.stringify(list)); drawKept(); return; }
      state.source = k.source; applyStyleString(k.style); changed({ now: true });
    };
    box.append(b);
    api('render', { source: k.source, style: k.style, size: 96 }, { as: 'blob' }).then((blob) => setImg(img, blob)).catch(() => {});
  }
}

// ---------- variations ----------
let variationStyles = [];
const hex = (h, s, l) => {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12; const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
};
async function variations() {
  if (!state.source) return status('Pick an icon first.', true);
  const h = Math.floor(Math.random() * 360);
  variationStyles = [
    `color=#ffffff bg=${hex(h, 62, 42)} shape=squircle`,
    `color=${hex(h, 70, 40)} bg=#ffffff shape=circle`,
    `color=#ffffff bg=linear-gradient(135deg,${hex(h, 75, 60)},${hex((h + 40) % 360, 70, 38)}) shape=rounded shadow`,
    `color=${hex((h + 180) % 360, 70, 62)} bg=#1f2228 shape=squircle`,
    `color=#ffffff`,
    `color=${hex(h, 65, 45)}`,
  ];
  $('variationsBox').hidden = false; $('variations').disabled = true;
  try { setImg($('variationsImg'), await api('grid', { sources: [state.source], styles: variationStyles, post: isRaw(state.source) }, { as: 'blob' })); }
  catch (e) { status(e.message, true); }
  finally { $('variations').disabled = false; }
}

// ---------- download, save, apply ----------
async function download(format) {
  if (!state.source) return status('Pick an icon first.', true);
  for (const b of document.querySelectorAll('[data-format]')) b.disabled = true;
  status('Making files…');
  try {
    const blob = await api('download', { source: state.source, style: styleString(), name: $('name').value || 'icon', format }, { as: 'blob' });
    const ext = { ico: '.ico', png: '-256.png', icns: '.icns', web: '-web.zip', pngset: '-pngset.zip' }[format];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = ($('name').value || 'icon') + ext; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    status('Downloaded.');
  } catch (e) { status(e.message, true); }
  finally { for (const b of document.querySelectorAll('[data-format]')) b.disabled = false; }
}

async function applyToApps() {
  const apps = [...$('applyApps').querySelectorAll('input:checked')].map((i) => i.value);
  if (!apps.length) return status('Tick at least one app.', true);
  if (!state.source) return status('Pick an icon first.', true);
  $('apply').disabled = true; status(`Applying to ${apps.length} app(s)…`);
  try {
    const own = /^app:/.test(state.source) && apps.length > 1;
    const r = await api('apply', { post: true, apps, source: own ? 'app' : state.source, style: styleString() });
    const failed = r.results.filter((x) => x.error);
    status(failed.length ? `Done, but ${failed.map((f) => `${f.app}: ${f.error}`).join('; ')}` : `Applied to ${apps.length} app(s).${r.hint ? ' Some pinned icons update after an Explorer restart (iconwright refresh).' : ''}`, failed.length > 0);
  } catch (e) { status(e.message, true); }
  finally { $('apply').disabled = false; }
}

// ---------- share: URL hash and "copy for your agent" ----------
function saveHash() {
  const h = new URLSearchParams();
  if (state.source && (!isRaw(state.source) || state.source.length < 1500)) h.set('source', state.source);
  const st = styleString(); if (st) h.set('style', st);
  if (state.label !== 'My App') h.set('label', state.label);
  history.replaceState(null, '', `${location.pathname}${location.search}${h.size ? '#' + h : ''}`);
}
function loadHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('source')) state.source = h.get('source');
  if (h.get('style')) applyStyleString(h.get('style'));
  if (h.get('label')) { state.label = h.get('label'); $('label').value = state.label; }
}
async function copyForAgent() {
  if (!state.source) return status('Pick an icon first.', true);
  const st = styleString();
  const src = isRaw(state.source) ? 'the SVG below' : `"${state.source}"`;
  let text = `Use iconwright with source ${src}${st ? ` and style "${st}"` : ''}.`;
  if (isRaw(state.source)) text += `\n\n${state.source}`;
  else text += `\nCLI: iconwright make ${state.source}${st ? ` --style "${st}"` : ''}`;
  try { await navigator.clipboard.writeText(text); status('Copied. Paste it to your agent.'); }
  catch { status('Copying is blocked in this browser. Use the style code in Look instead.', true); }
}

// ---------- wiring ----------
function radios(group, key, after) {
  for (const b of group.children) b.onclick = () => { state[key] = b.dataset.v; after?.(); changed(); };
}
async function init() {
  try { info = await api('info'); } catch (e) { status(`Can't reach the iconwright engine: ${e.message}`, true); }
  state.scenes = new Set(JSON.parse(localStorage.getItem('iconwright.scenes') || 'null') || info.defaultScenes);
  if (info.local) { $('mode').hidden = false; $('mode').textContent = info.windows ? 'Running on this PC' : 'Running locally'; }
  if (info.windows) { $('appsTab').hidden = false; $('applyBox').hidden = false; loadApps().catch((e) => status(e.message, true)); }

  for (const name of info.scenes) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = name; b.setAttribute('aria-pressed', String(state.scenes.has(name)));
    b.onclick = () => {
      if (state.scenes.has(name)) { if (state.scenes.size > 1) state.scenes.delete(name); } else state.scenes.add(name);
      b.setAttribute('aria-pressed', String(state.scenes.has(name)));
      localStorage.setItem('iconwright.scenes', JSON.stringify([...state.scenes]));
      changed();
    };
    $('sceneChips').append(b);
  }

  for (const t of document.querySelectorAll('.tabs button')) t.onclick = () => {
    for (const o of document.querySelectorAll('.tabs button')) o.setAttribute('aria-selected', String(o === t));
    for (const body of document.querySelectorAll('.tab-body')) body.hidden = body.dataset.body !== t.dataset.tab;
  };
  let typeTimer = 0;
  $('searchForm').onsubmit = (e) => { e.preventDefault(); clearTimeout(typeTimer); search($('query').value.trim()); $('query').blur(); };
  $('query').oninput = () => { clearTimeout(typeTimer); const q = $('query').value.trim(); if (q.length > 1) typeTimer = setTimeout(() => search(q), 400); };
  for (const b of $('suggest').children) b.onclick = () => { $('query').value = b.textContent; search(b.textContent); };
  for (const b of document.querySelectorAll('.tabbar button')) b.onclick = () => {
    $('layout').dataset.view = b.dataset.view;
    for (const o of document.querySelectorAll('.tabbar button')) o.setAttribute('aria-current', String(o === b));
    window.scrollTo({ top: 0 });
  };
  $('reset').onclick = () => { applyStyleString(''); changed({ now: true }); };
  $('closeIdeas').onclick = () => { $('variationsBox').hidden = true; };
  $('more').onclick = () => search(lastQuery, true);
  $('useSvg').onclick = () => { const s = $('svgText').value.trim(); if (!s.startsWith('<')) return status('That doesn\'t look like SVG code.', true); pickSource(s); };

  $('recolor').onchange = () => { state.recolor = $('recolor').checked; changed(); };
  $('color').oninput = () => { state.color = $('color').value; state.recolor = true; changed(); };
  $('colorText').onchange = () => { const h = toHex($('colorText').value); if (h) { state.color = h; state.recolor = true; changed(); } };
  radios($('bgMode'), 'bgMode');
  radios($('shape'), 'shape');
  for (const [id, key] of [['bg1', 'bg1'], ['bg2', 'bg2']]) $(id).oninput = () => { state[key] = $(id).value; changed(); };
  $('angle').oninput = () => { state.angle = Number($('angle').value); changed(); };
  $('radius').oninput = () => { state.radius = Number($('radius').value); changed(); };
  $('padding').oninput = () => { state.padding = Number($('padding').value); changed(); };
  $('shadow').onchange = () => { state.shadow = $('shadow').checked; changed(); };
  $('styleText').onchange = () => {
    const problem = styleProblem($('styleText').value);
    if (problem) { $('styleText').classList.add('bad'); return status(problem, true); }
    applyStyleString($('styleText').value); changed({ now: true });
  };
  $('label').onchange = () => { state.label = $('label').value || 'My App'; changed(); };
  $('scale').onchange = () => { state.scale = Number($('scale').value); changed(); };
  for (const b of document.querySelectorAll('.canvas-tools button')) b.onclick = () => {
    $('canvas').dataset.bg = b.dataset.bg; $('canvas').classList.toggle('checker', b.dataset.bg === 'checker');
    for (const o of document.querySelectorAll('.canvas-tools button')) o.setAttribute('aria-pressed', String(o === b));
  };
  $('pin').onclick = () => {
    if (!state.source) return status('Pick an icon first.', true);
    const list = kept(); list.unshift({ source: state.source, style: styleString() });
    localStorage.setItem(KEPT, JSON.stringify(list.slice(0, 10))); drawKept();
  };
  $('variations').onclick = variations;
  $('variationsImg').onclick = (e) => {
    const r = e.target.getBoundingClientRect();
    const i = Math.min(variationStyles.length - 1, Math.floor(((e.clientX - r.left) / r.width) * variationStyles.length));
    applyStyleString(variationStyles[i]); changed({ now: true });
  };
  for (const b of document.querySelectorAll('[data-format]')) b.onclick = () => download(b.dataset.format);
  $('apply').onclick = applyToApps;
  $('copyAgent').onclick = copyForAgent;

  loadHash();
  syncControls(); drawKept();
  const related = /^[\w-]+:[\w-]+$/.test(state.source) ? state.source.split(':')[1].split('-')[0] : '';
  if (related) { $('query').value = related; search(related); }
  if (state.source) render();
  else { $('empty').textContent = 'Pick an icon to start.'; $('query').value = 'rocket'; search('rocket'); }
}
init();
