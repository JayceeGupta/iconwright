// Windows commands for the iconwright CLI. Unknown options are errors, so typos never pass silently.
import { register } from './cli.mjs';
import { parseArgs } from './args.mjs';
import { applyIcons, applyDesktopIcon } from './apply.mjs';
import { win } from './win.mjs';
import { toJson } from './output.mjs';
import { parseStyle } from './render.mjs';

const out = toJson;
const STYLE = { style: 'string', cutout: 'boolean', color: 'string', bg: 'string', shape: 'string', radius: 'number', padding: 'number', shadow: 'boolean', name: 'string', out: 'string' };
const RESTART = { 'no-restart': 'boolean', cooldown: 'number' };
const restartOpts = (v) => ({ noRestart: v['no-restart'], restartCooldown: v.cooldown });
const styleOpts = (v) => ({ ...parseStyle(v.style), ...Object.fromEntries(['cutout','color','bg','shape','radius','padding','shadow'].filter((k) => v[k] !== undefined).map((k) => [k,v[k]])), name: v.name, outDir: v.out });

// Registers a command whose arguments follow `spec`; `--help` prints `usage`.
function command(name, usage, spec, handler) {
  register(name, async (args) => {
    const { values, positional, help } = parseArgs(args, spec);
    if (help) return `Usage: iconwright ${usage}`;
    return out(await handler(values, positional));
  }, usage);
}
const need = (cond, usage) => { if (!cond) throw new Error(`Usage: iconwright ${usage}`); };

command('apps', 'apps [text]', { positional: 'any' }, (v, pos) => win('apps', { query: pos.join(' ') }));

command('info', 'info <app...>', { positional: 'any' }, (v, pos) => {
  need(pos.length, 'info <app...>');
  return win('info', { app: pos });
});

command('set-icon', 'set-icon <app> --icon file.ico [--index n]', { positional: 'any', flags: { icon: 'string', index: 'number' } }, (v, pos) => {
  need(pos.length === 1 && v.icon, 'set-icon <app> --icon file.ico [--index n]');
  return win('set-icon', { app: pos[0], icon: v.icon, iconIndex: v.index });
});

const APPLY = 'apply <app...> --source <ref|app> [style] [--pin] [--refresh]   or   apply <app> --icon file.ico';
command('apply', APPLY, { positional: 'any', flags: { source: 'string', icon: 'string', index: 'number', pin: 'boolean', refresh: 'boolean', ...STYLE, ...RESTART } }, (v, pos) => {
  need(pos.length && Boolean(v.source) !== Boolean(v.icon), APPLY);
  if (v.icon) {
    need(pos.length === 1, APPLY);
    return win('set-icon', { app: pos[0], icon: v.icon, iconIndex: v.index });
  }
  return applyIcons({ apps: pos, source: v.source, ...styleOpts(v), pin: v.pin, refresh: v.refresh, ...restartOpts(v) }, win);
});

command('pins', 'pins [--pin a,b] [--unpin c] [--order a,b] [--position n] [--dry-run] [--no-restart] [--restart-cooldown n]', { flags: { pin: 'string', unpin: 'string', order: 'string', position: 'number', 'dry-run': 'boolean', 'no-restart': 'boolean', 'restart-cooldown': 'number' } }, (v) => {
  need(v.pin || v.unpin || v.order, 'pins [--pin a,b] [--unpin c] [--order a,b]');
  const list = (s) => s?.split(',').map((x) => x.trim()).filter(Boolean);
  return win('pins', { pin: list(v.pin), unpin: list(v.unpin), order: list(v.order), position: v.position, dryRun: v['dry-run'], noRestart: v['no-restart'], restartCooldown: v['restart-cooldown'] });
});

command('pin', 'pin <app...> [--icon file.ico] [--no-restart] [--cooldown s]', { positional: 'any', flags: { icon: 'string', ...RESTART } }, (v, pos) => {
  need(pos.length, 'pin <app...>');
  return win('pin', { app: pos, icon: v.icon, ...restartOpts(v) });
});

command('unpin', 'unpin <app...> [--no-restart] [--cooldown s]', { positional: 'any', flags: RESTART }, (v, pos) => {
  need(pos.length, 'unpin <app...>');
  return win('unpin', { app: pos, ...restartOpts(v) });
});

command('reorder', 'reorder <app...> [--position n] [--no-restart] [--cooldown s]', { positional: 'any', flags: { position: 'number', ...RESTART } }, (v, pos) => {
  need(pos.length, 'reorder <app...> [--position n]');
  return win('reorder', { app: pos, position: v.position, ...restartOpts(v) });
});

command('refresh', 'refresh [--cooldown s]', { flags: { cooldown: 'number' } }, (v) => win('refresh', restartOpts(v)));

command('status', 'status', {}, () => win('status'));

command('restore', 'restore <app...> | restore --all', { positional: 'any', flags: { all: 'boolean' } }, (v, pos) => {
  if (v.all) { need(!pos.length, 'restore <app...> | restore --all'); return win('restore-all'); }
  need(pos.length, 'restore <app...> | restore --all');
  return win('restore', { app: pos });
});

command('restore-pins', 'restore-pins [--from last|original]', { flags: { from: 'string' } }, (v) => {
  const from = v.from ?? 'last';
  need(['last', 'original'].includes(from), 'restore-pins [--from last|original]');
  return win('restore-pins', { value: from });
});

command('capture', 'capture [taskbar|desktop|screen] [--out file.png] [--max-width px]', { positional: 'any', flags: { out: 'string', 'max-width': 'number' } }, (v, pos) => {
  const what = pos[0] ?? 'taskbar';
  need(pos.length <= 1 && ['taskbar', 'desktop', 'screen'].includes(what), 'capture [taskbar|desktop|screen] [--out file.png]');
  return win('capture', { value: what, file: v.out, maxWidth: v['max-width'] });
});

command('doctor', 'doctor', {}, () => win('doctor'));

// desktop <sub> ...: each subcommand has its own options.
const DESKTOP = {
  list: [{}, () => win('desktop-list')],
  move: [{ positional: 'any', flags: { x: 'number', y: 'number' } }, (v, pos) => {
    need(pos.length === 1 && v.x != null && v.y != null, 'desktop move <item> --x px --y px');
    return win('desktop-move', { item: pos[0], x: v.x, y: v.y });
  }],
  arrange: [{ positional: 'any', flags: { by: 'string', corner: 'string', flow: 'string', monitor: 'number' } },
    (v, pos) => win('desktop-arrange', { item: pos, by: v.by, corner: v.corner, flow: v.flow, monitor: v.monitor })],
  size: [{ positional: 'any' }, (v, pos) => {
    need(pos.length === 1, 'desktop size small|medium|large|xl|huge|<16-256>');
    return win('desktop-size', { value: pos[0] });
  }],
  options: [{ flags: { 'auto-arrange': 'string', snap: 'string', icons: 'string' } },
    (v) => win('desktop-options', { autoArrange: v['auto-arrange'], snapToGrid: v.snap, showIcons: v.icons })],
  system: [{ positional: 'any', flags: { show: 'boolean', hide: 'boolean' } }, (v, pos) => {
    need(pos.length && Boolean(v.show) !== Boolean(v.hide), 'desktop system <names...> --show|--hide');
    return win('desktop-system', { item: pos, value: v.show ? 'show' : 'hide' });
  }],
  apply: [{ positional: 'any', flags: { source: 'string', icon: 'string', index: 'number', ...STYLE } }, (v, pos) => {
    need(pos.length === 1, 'desktop apply <item> (--source <ref|item> [style] | --icon file.ico)');
    return applyDesktopIcon({ item: pos[0], source: v.source, icon: v.icon, iconIndex: v.index, ...styleOpts(v) }, win);
  }],
  restore: [{ positional: 'any' }, (v, pos) => { need(pos.length, 'desktop restore <item...>'); return win('desktop-restore', { item: pos }); }],
  save: [{ positional: 'any' }, (v, pos) => { need(pos.length === 1, 'desktop save <file.json>'); return win('desktop-save', { file: pos[0] }); }],
  load: [{ positional: 'any' }, (v, pos) => { need(pos.length === 1, 'desktop load <file.json>'); return win('desktop-load', { file: pos[0] }); }],
};
register('desktop', async (args) => {
  const [sub, ...rest] = args;
  const entry = DESKTOP[sub];
  if (!entry) throw new Error(`Usage: iconwright desktop ${Object.keys(DESKTOP).join('|')} ...`);
  const { values, positional, help } = parseArgs(rest, entry[0]);
  if (help) return 'See: iconwright help';
  return out(await entry[1](values, positional));
}, 'desktop <list|move|arrange|size|options|system|apply|restore|save|load> ...');
