import { makeIcon } from './render.mjs';
import { searchIcons } from './source.mjs';
import { makeSheet } from './sheet.mjs';
import { toJson } from './output.mjs';

export const commands = new Map();
export function register(name, handler, usage = '') { commands.set(name, { handler, usage }); }

function parseFlags(args) {
  const values = {}, positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const key = arg.slice(2);
    if (key === 'help') { values.help = true; continue; }
    if (i + 1 >= args.length || args[i + 1].startsWith('--')) throw new Error(`missing value for ${arg}`);
    values[key] = args[++i];
  }
  return { values, positional };
}

register('search', async (args) => {
  const { values, positional } = parseFlags(args);
  if (values.help) return 'Usage: iconwright search <query> [--limit N]';
  const ids = await searchIcons(positional.join(' '), values.limit);
  return ids.join('\n');
}, 'search <query> [--limit N]');

register('make', async (args) => {
  const { values } = parseFlags(args);
  if (values.help) return 'Usage: iconwright make --source <ref> [--name n] [--color c] [--bg c] [--shape s] [--radius r] [--padding p] [--png-size px] [--out dir]';
  if (!values.source) throw new Error('make requires --source <ref>');
  const result = await makeIcon({ source: values.source, name: values.name, color: values.color, bg: values.bg, shape: values.shape, radius: values.radius === undefined ? undefined : Number(values.radius), padding: values.padding === undefined ? undefined : Number(values.padding), outDir: values.out, pngSize: values['png-size'] });
  return toJson({ ico: result.ico, preview: result.preview, png: result.pngs[0] });
}, 'make --source <ref> [options]');

register('sheet', async (args) => {
  const { values, positional } = parseFlags(args);
  if (values.help) return 'Usage: iconwright sheet <files...> --out <path>';
  if (!values.out) throw new Error('sheet requires --out <path>');
  return makeSheet(positional, values.out);
}, 'sheet <files...> --out path');

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
  apply <app> --source <ref> [style]  make an icon and put it on the app (or --icon file.ico)
      [--pin] [--refresh]
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
file, or raw <svg> text. Windows commands print one line of JSON.`;

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
