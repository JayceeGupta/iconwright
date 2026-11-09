// Site behavior: copy buttons, theme, docs menu, search, and "On this page" highlighting.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

async function copy(text, button, done = 'Copied', ms = 1600) {
  const label = button.querySelector('span:not(.ico)') ?? button;
  const old = label.dataset.label ?? label.textContent;
  label.dataset.label = old;
  // Hold the width so the new label never shifts the layout.
  button.style.minWidth = `${button.offsetWidth}px`;
  try { await navigator.clipboard.writeText(text); label.textContent = done; button.classList.add('copied'); }
  catch { label.textContent = 'Copy failed'; }
  clearTimeout(button.copyTimer);
  button.copyTimer = setTimeout(() => { label.textContent = old; button.classList.remove('copied'); }, ms);
}

for (const pre of $$('pre')) {
  const b = document.createElement('button');
  b.className = 'copy'; b.type = 'button'; b.textContent = 'Copy'; b.setAttribute('aria-label', 'Copy this code');
  b.addEventListener('click', () => copy(pre.querySelector('code')?.innerText ?? pre.innerText, b));
  // The button sits on a wrapper, not inside the scrolling block, so long lines never run under it.
  const wrap = document.createElement('div');
  wrap.className = 'code';
  pre.replaceWith(wrap);
  wrap.append(pre, b);
}
for (const b of $$('[data-copy-md]')) {
  b.addEventListener('click', async () => copy(await (await fetch(b.dataset.copyMd)).text(), b, 'Copied'));
}

for (const b of $$('[data-copy-from]')) {
  b.addEventListener('click', () => copy($(`${b.dataset.copyFrom} code`)?.innerText ?? '', b, b.dataset.copied ?? 'Copied', 3200));
}

// ---------- tabs (arrow keys move between them) ----------
function tablist(list, onPick) {
  const tabs = $$('[role="tab"]', list);
  const pick = (i, focus) => {
    tabs.forEach((t, n) => { t.setAttribute('aria-selected', String(n === i)); t.tabIndex = n === i ? 0 : -1; });
    tabs[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focus) tabs[i].focus();
    onPick(i);
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => pick(i));
    t.addEventListener('keydown', (e) => {
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to !== undefined) { e.preventDefault(); pick((to + tabs.length) % tabs.length, true); }
    });
  });
  return { tabs, pick };
}
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- home: mockup tabs ----------
const sceneList = $('.scene-tabs');
if (sceneList) {
  const imgs = $$('#scenes img');
  tablist(sceneList, (i) => imgs.forEach((img, n) => { img.classList.toggle('on', n === i); img.toggleAttribute('aria-hidden', n !== i); }));
  addEventListener('load', () => { for (const img of imgs) img.loading = 'eager'; });
}

// ---------- home: the demo ----------
// One terminal session: each request is typed, the tool calls appear, the taskbar changes, then the
// result. The last request is undo, so the loop ends where it began. Pauses off screen, when the tab is
// hidden, and once the visitor picks a request; never plays on its own with reduced motion.
const demo = $('#demo');
if (demo) {
  const steps = JSON.parse($('#demo-steps').textContent);
  const desk = $('#desk'), log = $('.log-in', demo), pics = $$('.bar picture', demo), playBtn = $('.play', demo);
  const HOLD = 2000, TYPE = 16;
  let cur = 0, token = 0, playing = !reduceMotion, onScreen = false;
  const chips = tablist($('.chips', demo), (i) => { setPlaying(false); sync(); cur = i; addTurn(i); showBar(i); });

  const el = (cls, text) => Object.assign(document.createElement('p'), { className: cls, textContent: text });
  const callEl = (c) => {
    const p = el('call', '');
    p.append(Object.assign(document.createElement('span'), { className: 'full', textContent: c }), Object.assign(document.createElement('span'), { className: 'short', textContent: c.replace(/\(.*$/, '(…)') }));
    return p;
  };
  function showBar(i) {
    pics.forEach((p, n) => { p.classList.toggle('on', n === i); $('img', p).toggleAttribute('aria-hidden', n !== i); });
    desk.setAttribute('aria-labelledby', chips.tabs[i].id);
  }
  function select(i) { chips.tabs.forEach((t, n) => { t.setAttribute('aria-selected', String(n === i)); t.tabIndex = n === i ? 0 : -1; }); }
  // New lines push the old ones up: measure, append, then slide from the old position (transform only).
  function append(node, into = log) {
    const h0 = log.offsetHeight;
    into.append(node);
    if (reduceMotion) return prune();
    node.classList.add('new');
    log.style.transition = 'none';
    log.style.transform = `translateY(${log.offsetHeight - h0}px)`;
    log.offsetHeight; // apply the start position before transitioning
    log.style.transition = 'transform var(--d-base) var(--ease-out)';
    log.style.transform = '';
    prune();
  }
  // A turn that would reach the top edge leaves whole (fades and lifts) instead of being cut off.
  // Measured at rest: the turn's place inside the list plus the list's untransformed offset.
  function prune() {
    const pad = parseFloat(getComputedStyle(log.parentElement).paddingTop), base = log.getBoundingClientRect().top;
    for (const t of [...log.children]) {
      if (t === log.lastElementChild || t.classList.contains('gone') || log.offsetTop + t.getBoundingClientRect().top - base >= pad - 1) continue;
      t.classList.add('gone');
      if (reduceMotion) { t.remove(); continue; }
      t.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 160, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' }).finished.then(() => t.remove());
    }
  }
  function addTurn(i) {
    $('.turn.partial', log)?.remove();
    const turn = document.createElement('div');
    turn.className = 'turn';
    turn.append(el('ask', steps[i].ask), ...steps[i].call.map(callEl), el('did', steps[i].did));
    append(turn);
  }
  const sleep = (ms, t) => new Promise((ok, no) => setTimeout(() => (t === token ? ok() : no()), ms));
  async function animate(i, t) {
    const s = steps[i];
    select(i);
    const turn = document.createElement('div');
    turn.className = 'turn partial';
    const ask = el('ask', ''), typed = document.createTextNode(''), caret = document.createElement('span');
    caret.className = 'caret';
    ask.append(typed, caret);
    // Lay the line out at its final height first, so a request that wraps does not jump mid-typing.
    typed.data = s.ask;
    turn.append(ask);
    append(turn);
    ask.style.minHeight = `${ask.offsetHeight}px`;
    typed.data = '';
    prune();
    for (let n = 1; n <= s.ask.length; n++) { typed.data = s.ask.slice(0, n); prune(); await sleep(TYPE, t); }
    caret.remove();
    await sleep(320, t);
    for (const c of s.call) { append(callEl(c), turn); await sleep(260, t); }
    showBar(i);
    await sleep(420, t);
    append(el('did', s.did), turn);
    turn.classList.remove('partial');
  }
  // The progress line fills during the pause, then fades out at full width rather than vanishing.
  function timing(i, on) { chips.tabs.forEach((c, n) => { c.classList.toggle('done', !on && c.classList.contains('timing')); c.classList.toggle('timing', on && n === i); }); }
  async function loop() {
    const t = ++token;
    try {
      for (;;) {
        demo.style.setProperty('--step-ms', `${HOLD}ms`);
        timing(cur, true);
        await sleep(HOLD, t);
        timing(cur, false);
        cur = (cur + 1) % steps.length;
        await animate(cur, t);
      }
    } catch { /* stopped */ }
  }
  // Stopping mid-request finishes it at once, so the terminal and taskbar always agree.
  function stop() {
    token++;
    timing(cur, false);
    if ($('.turn.partial', log)) { addTurn(cur); showBar(cur); }
  }
  function setPlaying(on) {
    playing = on;
    demo.classList.toggle('paused', !on);
    playBtn.setAttribute('aria-label', on ? 'Pause the demo' : 'Play the demo');
    $('.play-label', playBtn).textContent = on ? 'Pause' : 'Play';
  }
  const sync = () => { if (playing && onScreen && !document.hidden) { if (!demo.classList.contains('running')) { demo.classList.add('running'); loop(); } } else { demo.classList.remove('running'); stop(); } };
  playBtn.hidden = false;
  playBtn.addEventListener('click', () => { setPlaying(!playing); sync(); });
  setPlaying(playing);
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; demo.classList.toggle('offscreen', !onScreen); sync(); }, { threshold: 0.35 }).observe(desk);
  document.addEventListener('visibilitychange', sync);
  addEventListener('load', () => { for (const img of $$('.bar img', demo)) img.loading = 'eager'; });
}

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
  if (open) $('.side a[aria-current]')?.scrollIntoView({ block: 'nearest' });
}
menuBtn?.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
for (const c of $$('[data-close-menu]')) c.addEventListener('click', () => setMenu(false));
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
  for (const w of words) out = out.replace(new RegExp(`\\b(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
  return out;
}
function snippet(text, words) {
  const lower = text.toLowerCase();
  const at = Math.max(0, Math.min(...words.map((w) => { const i = lower.indexOf(w); return i < 0 ? Infinity : i; })) - 40);
  let from = Number.isFinite(at) ? at : 0, to = from + 160;
  if (from > 0) from = text.indexOf(' ', from) + 1 || from;
  if (to < text.length) to = text.lastIndexOf(' ', to);
  return (from > 0 ? '…' : '') + text.slice(from, to).trim() + (to < text.length ? ' …' : '');
}
function runSearch() {
  const q = input.value.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  hits.replaceChildren(); selected = 0;
  dialog.classList.remove('is-empty');
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
    if (score) scored.push([/^(Windows internals|How it works)$/.test(e.p) ? score * 0.4 : score, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  if (!scored.length) { hits.innerHTML = `<li class="none"><b>No results for “${escHtml(input.value.trim())}”</b><span>Try a shorter word, one of these, or <a href="/llms-full.txt">read every page in one file</a>.</span><span class="try">${['pin', 'undo', 'favicon'].map((q) => `<button class="btn sm" type="button" data-q="${q}">${q}</button>`).join('')}</span></li>`; dialog.classList.add('is-empty'); for (const b of $$('[data-q]', hits)) b.onclick = () => { input.value = b.dataset.q; runSearch(); input.focus(); }; return; }
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
async function loadIndex() {
  try { index = await (await fetch('/search.json')).json(); runSearch(); }
  catch {
    index = null;
    dialog.classList.add('is-empty');
    hits.innerHTML = '<li class="none"><b>Search could not load</b><span>Check your connection, then try again.</span><button class="btn sm primary" type="button" data-retry>Try again</button></li>';
    $('[data-retry]', hits).addEventListener('click', () => { hits.replaceChildren(); dialog.classList.remove('is-empty'); loadIndex(); input.focus(); });
  }
}
async function openSearch() {
  if (!dialog) return;
  setMenu(false);
  dialog.showModal(); input.focus(); input.select();
  if (!index) await loadIndex();
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
