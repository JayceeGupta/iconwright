// Mock taskbar demo: each request plays what iconwright would do, in order.
(() => {
  const bar = document.getElementById('taskbar');
  const log = document.getElementById('log');
  const buttons = [...document.querySelectorAll('.prompt')];
  const apps = [...bar.querySelectorAll('.tb.app')];
  const obsidian = bar.querySelector('[data-app="obsidian"]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
  const state = { white: false, pinned: false };

  const paint = (el, color) => { el.querySelector('svg').style.color = color; };
  const reset = () => apps.forEach((el) => paint(el, el.dataset.color));
  reset();

  const say = (html) => { log.innerHTML = html; };
  async function restartExplorer() {
    bar.classList.add('restarting');
    await wait(650);
    bar.classList.remove('restarting');
  }

  const steps = {
    async white() {
      say('Calling <code>apply_icon</code> for each pinned app, recolored white…');
      for (const el of apps) {
        if (el.classList.contains('hidden')) continue;
        el.classList.add('pop'); paint(el, '#ffffff');
        await wait(140);
        el.classList.remove('pop');
      }
      state.white = true;
      say('Done: icons changed live, no restart needed. Say "undo" to put the originals back.');
    },
    async pin() {
      if (state.pinned) { say('Obsidian is already pinned and first.'); return; }
      say('Calling <code>pin_apps</code> and <code>reorder_taskbar</code>. Explorer restarts once…');
      await wait(500);
      await restartExplorer();
      obsidian.classList.remove('hidden');
      paint(obsidian, state.white ? '#ffffff' : obsidian.dataset.color);
      state.pinned = true;
      say('Pinned Obsidian in first place. The pinned-apps list was backed up first.');
    },
    async undo() {
      if (!state.white && !state.pinned) { say('Nothing to undo yet: try another request first.'); return; }
      say('Calling <code>restore_all_icons</code>' + (state.pinned ? ' and <code>restore_taskbar_backup</code>…' : '…'));
      await wait(500);
      if (state.pinned) { await restartExplorer(); obsidian.classList.add('hidden'); }
      for (const el of apps) { paint(el, el.dataset.color); await wait(60); }
      state.white = false; state.pinned = false;
      say('Everything is back the way it was.');
    },
  };

  for (const b of buttons) {
    b.addEventListener('click', async () => {
      buttons.forEach((x) => { x.disabled = true; x.setAttribute('aria-pressed', String(x === b)); });
      try { await steps[b.dataset.step](); }
      finally { buttons.forEach((x) => { x.disabled = false; }); }
    });
  }

  // Install tabs (keyboard: arrow keys move between tabs).
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function select(tab) {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    tab.focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') select(tabs[(i + 1) % tabs.length]);
      if (e.key === 'ArrowLeft') select(tabs[(i - 1 + tabs.length) % tabs.length]);
    });
  });
})();
