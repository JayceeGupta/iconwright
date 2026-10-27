import { makeIcon } from './render.mjs';
import { searchIcons } from './source.mjs';
import { makeSheet } from './sheet.mjs';
import { toJson } from './output.mjs';
import { parseArgs } from './args.mjs';

export const commands = new Map();
export function register(name, handler, usage = '') { commands.set(name, { handler, usage }); }

register('search', async (args) => {
  const { values, positional, help } = parseArgs(args, { positional: 'any', flags: { limit: 'number' } });
  if (help || !positional.length) return 'Usage: iconwright search <words> [--limit n]';
  return (await searchIcons(positional.join(' '), values.limit)).join('\n');
}, 'search <words> [--limit n]');

register('make', async (args) => {
  const { values: v, help } = parseArgs(args, { flags: { source: 'string', name: 'string', color: 'string', bg: 'string', shape: 'string',
    radius: 'number', padding: 'number', out: 'string', 'png-size': 'number' } });
  const usage = 'Usage: iconwright make --source <ref> [--color c] [--bg c] [--shape s] [--radius r] [--padding p] [--name n] [--out dir] [--png-size px]';
  if (help) return usage;
  if (!v.source) throw new Error(usage);
  const r = await makeIcon({ source: v.source, name: v.name, color: v.color, bg: v.bg, shape: v.shape, radius: v.radius, padding: v.padding, outDir: v.out, pngSize: v['png-size'] });
  return toJson({ ico: r.ico, preview: r.preview, png: r.pngs[0] });
}, 'make --source <ref> [options]');

register('sheet', async (args) => {
  const { values, positional, help } = parseArgs(args, { positional: 'any', flags: { out: 'string' } });
  if (help || !values.out || !positional.length) return 'Usage: iconwright sheet <images...> --out file.png';
  return toJson({ path: await makeSheet(positional, values.out) });
}, 'sheet <images...> --out file.png');

export function help() {
  return HELP;
}

const HELP = `iconwright: make icons, and customize the Windows taskbar and desktop.

Make icons (any OS)
  search <words> [--limit n]          find icon names on Iconify, e.g. "music note"
  make --source <ref> [style]         write .ico + preview PNG + PNG
      style: --color c  --bg c  --shape rounded|circle|square  --radius 0-0.5
             --padding 0-0.5  --name n  --out dir  --png-size px
  sheet <images...> --out file.png    compare several icons side by side

Apps and taskbar (Windows)
  apps [text]                         find an app by name
  info <app...>                       an app's shortcuts, ID and pin state
  apply <app...> --source <ref> [style]  make an icon and put it on the apps (or --icon file.ico)
      [--pin] [--refresh]             --source app restyles each app's own icon
  set-icon <app> --icon file.ico      put an existing .ico on the app
  pin <app...> [--icon file.ico]      pin apps (restarts Explorer once)
  unpin <app...>                      unpin apps (restarts Explorer once)
  reorder <app...> --position n       move pinned apps (0 = first, -1 = last; restarts Explorer)
  refresh                             restart Explorer once so pinned icons reload
  status                              pinned apps and their icons
  pin, unpin, reorder and refresh also take --no-restart and --cooldown <seconds>

Desktop (Windows; changes are live)
  desktop list                        icons, positions, size and options
  desktop move <item> --x px --y px
  desktop arrange [items...] [--by name|type|none] [--flow columns|rows]
      [--corner top-left|top-right|bottom-left|bottom-right]
  desktop size small|medium|large|xl|huge|<16-256>
  desktop options [--auto-arrange on|off] [--snap on|off] [--icons on|off]
  desktop system <this-pc|recycle-bin|user-files|network|control-panel...> --show|--hide
  desktop apply <item> --source <ref> [style]   (or --icon file.ico)
  desktop restore <item...>
  desktop save <file.json>  |  desktop load <file.json>

Undo and checks (Windows)
  restore <app...>                    put an app's original icon back
  restore --all                       put back every icon iconwright changed
  restore-pins [--from last|original] put the pinned apps back from a backup
  doctor                              check this PC can run the Windows commands
  capture [taskbar|desktop|screen]    screenshot to check a change [--out file.png]

<ref> is an Iconify name (mdi:spotify, simple-icons:discord), a .svg/.png/.jpg/.webp/.ico
file, raw <svg> text, or (for apply) app. Commands print one line of JSON.`;

export async function run(argv = process.argv) {
  try {
    const args = argv.slice(2);
    const command = args.shift();
    if (!command || command === 'help' || command === '--help' || command === '-h') { console.log(help()); return 0; }
    const registered = commands.get(command);
    if (!registered) throw new Error(`unknown command: ${command}`);
    const result = await registered.handler(args);
    if (result) console.log(result);
    return 0;
  } catch (error) {
    console.error(error.message || String(error));
    return 1;
  }
}
