// Site behavior: copy buttons, theme, docs menu, search, and "On this page" highlighting.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

async function copy(text, button, done = 'Copied', ms = 1600) {
  const label = button.querySelector('span') ?? button;
  const old = label.dataset.label ?? label.textContent;
  label.dataset.label = old;
  try { await navigator.clipboard.writeText(text); label.textContent = done; }
  catch { label.textContent = 'Copy failed'; }
  clearTimeout(button.copyTimer);
  button.copyTimer = setTimeout(() => { label.textContent = old; }, ms);
}

for (const pre of $$('pre')) {
  const b = document.createElement('button');
  b.className = 'copy'; b.type = 'button'; b.textContent = 'Copy';
  b.addEventListener('click', () => copy(pre.querySelector('code')?.innerText ?? pre.innerText, b));
  pre.append(b);
}
for (const b of $$('[data-copy-md]')) {
  b.addEventListener('click', async () => copy(await (await fetch(b.dataset.copyMd)).text(), b, 'Copied'));
}

for (const b of $$('[data-copy-from]')) {
  b.addEventListener('click', () => copy($(`${b.dataset.copyFrom} code`)?.innerText ?? '', b, b.dataset.copied ?? 'Copied', 3200));
}

// ---------- home showcase tabs ----------
const tabs = $$('.show-tabs [role="tab"]');
function pickTab(tab, focus = false) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  }
  tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (focus) tab.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => pickTab(t));
  t.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step) { e.preventDefault(); pickTab(tabs[(i + step + tabs.length) % tabs.length], true); }
  });
});
// Fetch the other examples once the page has loaded, so switching is instant.
if (tabs.length) addEventListener('load', () => { for (const img of $$('.show-panel img')) img.loading = 'eager'; });

// ---------- theme ----------
for (const b of $$('[data-theme-toggle]')) b.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('theme', root.dataset.theme); } catch { /* private mode */ }
});

// ---------- docs menu (phones) ----------
const menuBtn = $('.menu-btn'), scrim = $('.scrim');
function setMenu(open) {
  document.body.classList.toggle('menu-open', open);
  if (scrim) scrim.hidden = !open;
  menuBtn?.setAttribute('aria-expanded', String(open));
  if (open) $('.side a[aria-current]')?.scrollIntoView({ block: 'center' });
}
menuBtn?.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
scrim?.addEventListener('click', () => setMenu(false));
for (const a of $$('.side a, .toc-mobile a')) a.addEventListener('click', () => { setMenu(false); a.closest('details')?.removeAttribute('open'); });

// Close the "more" menu when clicking elsewhere.
document.addEventListener('click', (e) => { for (const d of $$('details.more[open]')) if (!d.contains(e.target)) d.removeAttribute('open'); });

// ---------- "On this page" highlighting ----------
const tocLinks = $$('.toc a');
if (tocLinks.length && 'IntersectionObserver' in window) {
  const heads = tocLinks.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
  const visible = new Set();
  const mark = () => {
    const current = heads.find((h) => visible.has(h)) ?? heads.filter((h) => h.getBoundingClientRect().top < 120).pop() ?? heads[0];
    for (const a of tocLinks) a.classList.toggle('active', a.hash === `#${current?.id}`);
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
    mark();
  }, { rootMargin: '-70px 0px -65% 0px' });
  heads.forEach((h) => io.observe(h));
}

// ---------- search ----------
const dialog = $('#search'), input = $('#q'), hits = $('#hits');
let index = null, selected = 0;
const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function highlight(text, words) {
  let out = escHtml(text);
  for (const w of words) out = out.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
  return out;
}
function snippet(text, words) {
  const lower = text.toLowerCase();
  const at = Math.max(0, Math.min(...words.map((w) => { const i = lower.indexOf(w); return i < 0 ? Infinity : i; })) - 40);
  return (at > 0 ? '…' : '') + text.slice(Number.isFinite(at) ? at : 0, (Number.isFinite(at) ? at : 0) + 160);
}
function runSearch() {
  const q = input.value.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  hits.replaceChildren(); selected = 0;
  if (!words.length || !index) return;
  const scored = [];
  for (const e of index) {
    const h = e.h.toLowerCase(), p = e.p.toLowerCase(), x = e.x.toLowerCase();
    let score = 0;
    for (const w of words) {
      const s = (h.includes(w) ? 10 : 0) + (p.includes(w) ? 4 : 0) + (x.includes(w) ? 1 : 0);
      if (!s) { score = 0; break; }
      score += s + (h.startsWith(w) ? 3 : 0);
    }
    if (score) scored.push([score, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  if (!scored.length) { hits.innerHTML = `<li class="none">No results for “${escHtml(input.value.trim())}”.</li>`; return; }
  for (const [, e] of scored.slice(0, 12)) {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${e.u}" role="option"><span class="where">${escHtml(e.p)}</span><b>${highlight(e.h || e.p, words)}</b><span class="snip">${highlight(snippet(e.x, words), words)}</span></a>`;
    hits.append(li);
  }
  select(0);
}
function select(i) {
  const links = $$('a', hits);
  if (!links.length) return;
  selected = (i + links.length) % links.length;
  links.forEach((a, n) => a.setAttribute('aria-selected', String(n === selected)));
  links[selected].scrollIntoView({ block: 'nearest' });
}
async function openSearch() {
  if (!dialog) return;
  setMenu(false);
  dialog.showModal(); input.focus(); input.select();
  if (!index) { try { index = await (await fetch('/search.json')).json(); runSearch(); } catch { hits.innerHTML = '<li class="none">Search is unavailable right now.</li>'; } }
}
if (dialog) {
  for (const b of $$('[data-search]')) b.addEventListener('click', openSearch);
  input.addEventListener('input', runSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); select(selected + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(selected - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const a = $$('a', hits)[selected]; if (a) location.href = a.href; }
  });
  hits.addEventListener('click', (e) => { if (e.target.closest('a')) dialog.close(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); dialog.open ? dialog.close() : openSearch(); }
    if (e.key === 'Escape' && document.body.classList.contains('menu-open')) setMenu(false);
  });
  if (/Mac|iPhone|iPad/.test(navigator.platform)) for (const k of $$('.search-btn kbd')) k.textContent = '⌘K';
}
