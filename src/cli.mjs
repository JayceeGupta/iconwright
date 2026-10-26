import { makeIcon } from './render.mjs';
import { searchIcons } from './source.mjs';
import { makeSheet } from './sheet.mjs';

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
  return JSON.stringify({ ico: result.ico, preview: result.preview, png: result.pngs[0] });
}, 'make --source <ref> [options]');

register('sheet', async (args) => {
  const { values, positional } = parseFlags(args);
  if (values.help) return 'Usage: iconwright sheet <files...> --out <path>';
  if (!values.out) throw new Error('sheet requires --out <path>');
  return makeSheet(positional, values.out);
}, 'sheet <files...> --out path');

export function help() {
  return ['Usage: iconwright <command> [options]', '', ...[...commands].map(([name, command]) => `  ${command.usage}`), '  help'].join('\n');
}

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
