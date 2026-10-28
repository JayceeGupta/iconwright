// Make icons and apply them to apps or desktop items; shared by the CLI and the MCP server.
// `win` is the Windows bridge to use: win() from win.mjs, or a WinWorker's call().
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { makeIcon, defaultOutDir } from './render.mjs';
import { makeSheet } from './sheet.mjs';

import { STYLE_KEYS } from './render.mjs';
const isFile = (s) => /\.(svg|png|jpe?g|webp|ico)$/i.test(s) && !s.trim().startsWith('<');

// Windows caches icons by file path, so every distinct look needs its own file name. The tag
// covers the style and, for files, their contents (a file edited in place gets a new name).
async function styleTag(source, style) {
  const h = createHash('sha256').update(JSON.stringify([source, ...STYLE_KEYS.map((k) => style[k] ?? null)]));
  if (isFile(source)) h.update(await readFile(source));
  return h.digest('hex').slice(0, 10);
}

async function makeStyled(source, label, o) {
  const tag = await styleTag(source, o);
  return makeIcon({ source, ...Object.fromEntries(STYLE_KEYS.map((k) => [k, o[k]])), name: `${label}-${tag}`, outDir: o.outDir });
}

// Runs one stage; on failure, says what already happened so the agent can recover.
async function stage(name, done, fn) {
  try { return await fn(); }
  catch (e) {
    const so = done.length ? ` Already done: ${done.join('; ')}.` : ' Nothing on the PC was changed.';
    throw new Error(`${name} failed: ${e.message}${so}`);
  }
}

/**
 * Make an icon for each app and apply it (Start Menu + pinned shortcuts).
 * @param {object} o apps (array), source (Iconify id, file, raw SVG, or "app" = each app's own
 *   icon), color/bg/shape/radius/padding, name, outDir, pin, refresh, noRestart, restartCooldown
 */
export async function applyIcons(o, win) {
  const apps = [...new Set([].concat(o.apps ?? o.app ?? []).filter(Boolean).map(String))];
  if (!apps.length) throw new Error('apps is required');
  if (!o.source) throw new Error('source is required (an Iconify id, a file, raw <svg>, or "app" for each app\'s own icon)');
  const restart = { noRestart: o.noRestart, restartCooldown: o.restartCooldown };
  const done = [];
  const results = apps.map((app) => ({ app }));

  // 1. Sources: one shared source, or each app's own icon.
  if (o.source === 'app') {
    const images = await stage('Reading the apps\' icons', done, () => win('app-icon-image', { app: apps }));
    images.forEach((img, i) => { if (img.error) results[i].error = img.error; else results[i].source = img.image; });
  } else results.forEach((r) => { r.source = o.source; });

  // 2. Icons (one per app when the source differs; otherwise made once and shared).
  const made = new Map();
  for (const r of results) {
    if (r.error) continue;
    try {
      const label = apps.length === 1 && o.name ? o.name : (o.source === 'app' ? r.app : (o.name || (apps.length === 1 ? r.app : 'icon')));
      const key = r.source;
      if (!made.has(key)) made.set(key, await makeStyled(r.source, label, o));
      Object.assign(r, { ico: made.get(key).ico, preview: made.get(key).preview });
    } catch (e) { r.error = e.message; }
    delete r.source;
  }
  const ready = results.filter((r) => r.ico);
  if (!ready.length) throw new Error(`No icon could be made: ${results.map((r) => `${r.app}: ${r.error}`).join('; ')}`);
  const out = { results };

  // 3. Apply. Start Menu shortcuts first: pinning copies them, so new pins already carry the icon.
  const plan = (list) => JSON.stringify(list.map((r) => ({ app: r.app, icon: r.ico })));
  const set = await stage('Setting the icons', done, () => win('set-icons', { value: plan(ready) }));
  // Results come back in plan order, with each app's resolved name.
  if (set.results?.length !== ready.length) throw new Error(`Setting the icons returned ${set.results?.length} results for ${ready.length} apps; check app_info.`);
  set.results.forEach((s, i) => {
    const r = ready[i];
    if (s.error) { r.error = s.error; delete r.ico; return; }
    Object.assign(r, { app: s.app, updated: s.updated, ...(s.skipped?.length ? { skipped: s.skipped } : {}) });
  });
  const applied = ready.filter((r) => r.ico);
  done.push(`icons set for ${applied.length} app(s)`);
  let needsRefresh = set.needsRefresh;

  if (o.pin && applied.length) {
    out.pin = await stage('Pinning', done, () => win('pin', { app: applied.map((r) => r.app), ...restart }));
    if (out.pin.restarted) needsRefresh = false;   // the restart already reloaded every pinned icon
    if (out.pin.pinned?.length) {
      done.push(`pinned ${out.pin.pinned.length} app(s)`);
      // Pins built from scratch (Store apps have no Start Menu shortcut to copy) get the icon now.
      const again = await stage('Setting icons on the new pins', done, () => win('set-icons', { value: plan(applied) }));
      needsRefresh = needsRefresh || again.needsRefresh;
    }
  }
  if (needsRefresh) {
    if (o.refresh) out.refresh = await stage('Refreshing the taskbar', done, () => win('refresh', restart));
    else out.hint = 'Some pinned icons update after an Explorer restart: call the refresh tool once after all your changes.';
  }

  // 4. One image to look at: the preview, or a sheet of previews for several apps.
  const shown = ready.filter((r, i) => r.preview && ready.findIndex((x) => x.preview === r.preview) === i);
  if (shown.length === 1) out.preview = shown[0].preview;
  else out.preview = await makeSheet(shown.map((r) => r.preview), path.join(o.outDir || defaultOutDir(), 'last-apply-preview.png'), shown.map((r) => r.app)).catch(() => undefined);
  for (const r of results) delete r.preview;
  return out;
}

/** Make an icon (or take an .ico) and apply it to one desktop item. */
export async function applyDesktopIcon(o, win) {
  if (!o.item) throw new Error('item is required');
  if (Boolean(o.source) === Boolean(o.icon)) throw new Error('give exactly one of source (to make an icon) or icon (an existing .ico file)');
  let icon = o.icon, made = null;
  if (!icon) { made = await makeStyled(o.source, o.name || o.item, o); icon = made.ico; }
  const set = await win('desktop-set-icon', { item: o.item, icon, iconIndex: o.iconIndex });
  return { ico: icon, preview: made?.preview, set };
}
