// Windows taskbar commands for the iconwright CLI.
import { register } from './cli.mjs';
import { applyIcon, applyDesktopIcon } from './apply.mjs';
import { win } from './win.mjs';
import { toJson } from './output.mjs';

const BOOL = new Set(['pin', 'refresh', 'no-restart', 'help', 'show', 'hide', 'all']);
function parse(args) {
  const v = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const k = a.slice(2);
    if (BOOL.has(k)) { v[k] = true; continue; }
    if (i + 1 >= args.length) throw new Error(`missing value for ${a}`);
    v[k] = args[++i];
  }
  return { v, pos };
}
const out = toJson;
const apps = (v, pos) => [].concat(v.app ?? [], pos).filter(Boolean);
const restartOpts = (v) => ({ noRestart: v['no-restart'], restartCooldown: v.cooldown });

register('apps', async (args) => {
  const { pos } = parse(args);
  return out(await win('apps', { query: pos.join(' ') }));
}, 'apps [query]                          list Start menu apps (name + AppID)');

register('info', async (args) => {
  const { v, pos } = parse(args);
  return out(await win('info', { app: apps(v, pos) }));
}, 'info <app...>                         shortcuts, AppID, pin state');

register('set-icon', async (args) => {
  const { v, pos } = parse(args);
  if (!v.icon) throw new Error('set-icon requires --icon <file.ico>');
  return out(await win('set-icon', { app: apps(v, pos), icon: v.icon, iconIndex: v.index }));
}, 'set-icon <app> --icon f.ico [--index n]  apply an existing icon');

register('apply', async (args) => {
  const { v, pos } = parse(args);
  const num = (x) => (x === undefined ? undefined : Number(x));
  const targets = apps(v, pos);
  if (targets.length !== 1) throw new Error('apply takes exactly one app (quote names with spaces)');
  return out(await applyIcon({ app: targets[0], source: v.source, icon: v.icon, name: v.name, color: v.color,
    bg: v.bg, shape: v.shape, radius: num(v.radius), padding: num(v.padding), outDir: v.out,
    pin: v.pin, refresh: v.refresh, ...restartOpts(v) }));
}, 'apply <app> (--source ref [--color --bg --shape --radius --padding --name] | --icon f.ico) [--pin] [--refresh]');

register('refresh', async (args) => {
  const { v } = parse(args);
  return out(await win('refresh', restartOpts(v)));
}, 'refresh [--cooldown s]                restart explorer once so pinned icons reload');

register('pin', async (args) => {
  const { v, pos } = parse(args);
  return out(await win('pin', { app: apps(v, pos), icon: v.icon, ...restartOpts(v) }));
}, 'pin <app...> [--icon f.ico] [--no-restart] [--cooldown s]  (restarts explorer once)');

register('unpin', async (args) => {
  const { v, pos } = parse(args);
  return out(await win('unpin', { app: apps(v, pos), ...restartOpts(v) }));
}, 'unpin <app...> [--no-restart] [--cooldown s]');

register('restore', async (args) => {
  const { v, pos } = parse(args);
  if (v.all) return out(await win('restore-all'));
  if (!apps(v, pos).length) throw new Error('restore <app...> | restore --all');
  return out(await win('restore', { app: apps(v, pos) }));
}, 'restore <app...> | --all              put original icons back (--all: every app and desktop item)');

register('restore-pins', async (args) => {
  const { v } = parse(args);
  const from = v.from ?? 'last';
  if (!['last', 'original'].includes(from)) throw new Error('restore-pins [--from last|original]');
  return out(await win('restore-pins', { value: from }));
}, 'restore-pins [--from last|original]   undo pin-list changes from a backup (restarts explorer)');

register('capture', async (args) => {
  const { v, pos } = parse(args);
  const what = pos[0] ?? 'taskbar';
  if (!['taskbar', 'desktop', 'screen'].includes(what)) throw new Error('capture [taskbar|desktop|screen] [--out file.png] [--max-width px]');
  return out(await win('capture', { value: what, file: v.out, maxWidth: v['max-width'] }));
}, 'capture [taskbar|desktop|screen] [--out f.png]  screenshot to check a change');

register('doctor', async () => out(await win('doctor')), 'doctor                                check this PC can run the Windows commands');

register('status', async () => out(await win('status')), 'status                                pinned items and their icons');

register('reorder', async (args) => {
  const { v, pos } = parse(args);
  return out(await win('reorder', { app: pos, position: v.position, ...restartOpts(v) }));
}, 'reorder <app...> [--position n] [--no-restart] [--cooldown s]');

register('desktop', async (args) => {
  const sub = args.shift();
  const { v, pos } = parse(args);
  const item = pos;
  const desktopOpts = { item };
  switch (sub) {
    case 'list': return out(await win('desktop-list'));
    case 'move':
      if (!item[0] || v.x == null || v.y == null) throw new Error('desktop move <item> --x px --y px');
      return out(await win('desktop-move', { item: item[0], x: v.x, y: v.y }));
    case 'arrange': return out(await win('desktop-arrange', { ...desktopOpts, by: v.by, corner: v.corner, flow: v.flow, monitor: v.monitor }));
    case 'size': return out(await win('desktop-size', { value: item[0] }));
    case 'options': return out(await win('desktop-options', { autoArrange: v['auto-arrange'], snapToGrid: v.snap, showIcons: v.icons }));
    case 'system':
      if (Boolean(v.show) === Boolean(v.hide)) throw new Error('desktop system <names...> --show|--hide');
      return out(await win('desktop-system', { item, value: v.show ? 'show' : 'hide' }));
    case 'apply': {
      const target = item[0];
      if (!target) throw new Error('desktop apply <item> (--source ref | --icon f.ico)');
      const num = (x) => (x === undefined ? undefined : Number(x));
      return out(await applyDesktopIcon({ item: target, source: v.source, icon: v.icon, name: v.name, color: v.color,
        bg: v.bg, shape: v.shape, radius: num(v.radius), padding: num(v.padding), outDir: v.out, iconIndex: num(v.index) }));
    }
    case 'restore': return out(await win('desktop-restore', { item }));
    case 'save': return out(await win('desktop-save', { file: item[0] }));
    case 'load': return out(await win('desktop-load', { file: item[0] }));
    default: throw new Error('desktop list|move|arrange|size|options|system|apply|restore|save|load');
  }
}, 'desktop <list|move|arrange|size|options|system|apply|restore|save|load> ...');
