// Make (or take) an icon and apply it to an app; shared by the CLI and the MCP server.
import { createHash } from 'node:crypto';
import { makeIcon } from './render.mjs';
import { win } from './win.mjs';

/**
 * @param {object} o  app (required); source+style or icon; name, outDir; pin, refresh,
 *                    noRestart, restartCooldown
 */
export async function applyIcon(o) {
  if (!o.app) throw new Error('app is required');
  if (Boolean(o.source) === Boolean(o.icon)) throw new Error('provide exactly one of source or icon');
  const restart = { noRestart: o.noRestart, restartCooldown: o.restartCooldown };
  let icon = o.icon, made = null;
  if (!icon) {
    const style = { source: o.source, color: o.color, bg: o.bg, shape: o.shape, radius: o.radius, padding: o.padding };
    // Windows caches icons by file path, so each distinct look gets its own file name.
    const tag = createHash('sha1').update(JSON.stringify(style)).digest('hex').slice(0, 6);
    made = await makeIcon({ ...style, name: `${o.name || o.app}-${tag}`, outDir: o.outDir });
    icon = made.ico;
  }
  const result = { ico: icon, preview: made?.preview };
  // Pin with the icon already set, so the one explorer restart shows it.
  if (o.pin) result.pin = await win('pin', { app: o.app, icon, ...restart });
  result.set = await win('set-icon', { app: o.app, icon });
  if (result.set?.needsRefresh && !result.pin?.restarted) {
    if (o.refresh) result.refresh = await win('refresh', restart);
    else result.hint = 'This app\'s pinned icon updates after an explorer restart: call refresh once after all your changes.';
  }
  return result;
}

/** Create an icon and apply it to a desktop item. */
export async function applyDesktopIcon(o) {
  if (!o.item) throw new Error('item is required');
  if (Boolean(o.source) === Boolean(o.icon)) throw new Error('provide exactly one of source or icon');
  let icon = o.icon, made = null;
  if (!icon) {
    const style = { source: o.source, color: o.color, bg: o.bg, shape: o.shape, radius: o.radius, padding: o.padding };
    const tag = createHash('sha1').update(JSON.stringify(style)).digest('hex').slice(0, 6);
    made = await makeIcon({ ...style, name: `${o.name || o.item}-${tag}`, outDir: o.outDir });
    icon = made.ico;
  }
  const set = await win('desktop-set-icon', { item: o.item, icon, iconIndex: o.iconIndex });
  return { ico: icon, preview: made?.preview, set };
}
