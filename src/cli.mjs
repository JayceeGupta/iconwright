import { makeIcon, parseStyle, renderMaster } from './render.mjs';
import { searchIconsDetailed } from './source.mjs';
import { searchSheet, designGrid } from './design.mjs';
import { renderScenes, DEFAULT_SCENES, SCENES } from './scenes.mjs';
import { makeSheet } from './sheet.mjs';
import { parseArgs } from './args.mjs';
import { writeFile } from 'node:fs/promises';
import { toJson } from './output.mjs';
import { createRequire } from 'node:module';
import { resolveOwnIcons, isOwnIcon } from './own-icons.mjs';

const { version } = createRequire(import.meta.url)('../package.json');

export const commands = new Map();
export function register(name, handler, usage = '') { commands.set(name, { handler, usage }); }
const STYLE_FLAGS = { cutout: 'boolean', color: 'string', bg: 'string', shape: 'string', radius: 'number', padding: 'number', shadow: 'boolean' };
function style(v) { return { ...parseStyle(v.style), ...Object.fromEntries(Object.entries({ cutout: v.cutout, color: v.color, bg: v.bg, shape: v.shape, radius: v.radius, padding: v.padding, shadow: v.shadow }).filter(([, x]) => x !== undefined)) }; }
const csv = (v) => v?.split(',').map((x) => x.trim()).filter(Boolean);

register('search', async (args) => {
  const { values: v, positional, help } = parseArgs(args, { positional: 'any', flags: { limit: 'number', start: 'number', collections: 'string', palette: 'string', sheet: 'string' } });
  const usage = 'Usage: iconwright search <query> [--limit N] [--start N] [--collections mdi,ph] [--palette mono|color] [--sheet out.png]';
  if (help) return usage;
  if (!positional.length) throw new Error(usage);
  const { icons } = await searchIconsDetailed(positional.join(' '), { limit: v.limit, start: v.start, collections: csv(v.collections), palette: v.palette });
  const lines = [...icons];
  if (v.sheet) { const result = await searchSheet(icons); await writeFile(v.sheet, result.png); lines.push(v.sheet); }
  return lines.join('\n');
}, 'search <query> [options]');

register('make', async (args) => {
  const { values: v, positional, help } = parseArgs(args, { positional: 'any', flags: { style: 'string', ...STYLE_FLAGS, formats: 'string', name: 'string', out: 'string', 'png-size': 'number' } });
  const usage = 'Usage: iconwright make <source> [--style "..."] [--color ..] [--bg ..] [--shape ..] [--radius ..] [--padding ..] [--shadow] [--cutout] [--formats ico,png,icns,web,pngset] [--name n] [--out dir] [--png-size N]';
  if (help) return usage;
  if (!positional.length) throw new Error(usage);
  const [source] = await resolveAppSources(positional.slice(0, 1));
  const made = await makeIcon({ source, ...style(v), name: v.name, outDir: v.out, pngSize: v['png-size'], formats: csv(v.formats) });
  return Object.entries(made).map(([format, file]) => `${format}: ${file}`).join('\n');
}, 'make <source> [options]');

register('design', async (args) => {
  const { values: v, positional, help } = parseArgs(args, { positional: 'any', flags: { styles: 'string', out: 'string' } });
  const usage = 'Usage: iconwright design <source...> [--styles "<style>|<style>"] --out grid.png';
  if (help) return usage;
  if (!positional.length || !v.out) throw new Error(usage);
  const sources = await resolveAppSources(positional);
  const styles = v.styles ? v.styles.split('|').map((s) => parseStyle(s.trim())) : [{}];
  const result = await designGrid({ sources, styles }); await writeFile(v.out, result.png);
  return [...result.rows.map((r) => `${r.row}: ${r.source}`), ...result.columns.map((c) => `${c.column}: ${Object.keys(c).filter((k) => k !== 'column').map((k) => `${k}=${c[k]}`).join(' ') || 'default'}`), v.out].join('\n');
}, 'design <source...> [options]');

// app:<name> and desktop:<item> sources become that icon's image (Windows).
async function resolveAppSources(sources) {
  if (!sources.some(isOwnIcon)) return sources;
  const win = process.platform === 'win32' ? (await import('./win.mjs')).win : null;
  return resolveOwnIcons(sources, win);
}

register('preview', async (args) => {
  const { values: v, positional, help } = parseArgs(args, { positional: 'any', flags: { style: 'string', label: 'string', scenes: 'string', scale: 'number', out: 'string' } });
  const usage = 'Usage: iconwright preview <source> [--style "..."] [--label name] [--scenes taskbar,start,...] [--scale 1|1.5|2] --out scenes.png';
  if (help) return usage;
  if (!positional.length || !v.out) throw new Error(usage);
  const [source] = await resolveAppSources(positional.slice(0, 1));
  const scenes = csv(v.scenes) ?? DEFAULT_SCENES;
  for (const s of scenes) if (!SCENES.includes(s)) throw new Error(`unknown scene: ${s}`);
  const master = await renderMaster({ source, ...parseStyle(v.style) });
  const png = await renderScenes({ master, label: v.label, scenes, scale: v.scale ?? 1 });
  await writeFile(v.out, png); return v.out;
}, 'preview <source> [options]');

register('sheet', async (args) => {
  const { values, positional, help } = parseArgs(args, { positional: 'any', flags: { out: 'string' } });
  if (help) return 'Usage: iconwright sheet <images...> --out file.png';
  if (!values.out || !positional.length) throw new Error('Usage: iconwright sheet <images...> --out file.png');
  return toJson({ path: await makeSheet(positional, values.out) });
}, 'sheet <images...> --out file.png');

register('studio', async (args) => {
  const { values: v, positional, help } = parseArgs(args, { positional: 'any', flags: { port: 'number', style: 'string', 'no-open': 'boolean' } });
  const usage = 'Usage: iconwright studio [source] [--style "..."] [--port N] [--no-open]';
  if (help) return usage;
  if (v.style) parseStyle(v.style);
  const { startStudio, openBrowser } = await import('./studio.mjs');
  let win = null;
  if (process.platform === 'win32') { const { WinWorker } = await import('./win.mjs'); const w = new WinWorker(); win = (c, o) => w.call(c, o); }
  const studio = await startStudio({ port: v.port ?? 0, win, keepAlive: true });
  const url = studio.url({ source: positional[0], style: v.style });
  if (!v['no-open']) openBrowser(url);
  console.log(`iconwright studio is running at ${url}\nPress Ctrl+C to stop.`);
  await new Promise(() => {});   // runs until Ctrl+C
}, 'studio [source] [options]');

register('report', async (args) => {
  const { values: v, help } = parseArgs(args, { flags: { out: 'string' } });
  if (help) return 'Usage: iconwright report [--out report.md]   Environment and self-test, safe to share publicly';
  const { buildReport } = await import('./report.mjs');
  const win = process.platform === 'win32' ? (await import('./win.mjs')).win : null;
  const md = await buildReport({ win });
  if (v.out) { await writeFile(v.out, md); return v.out; }
  return md;
}, 'report [--out file.md]');

export function help() { return HELP; }
const HELP = `iconwright: design icons, and customize the Windows taskbar and desktop.

Design (any OS)
  search <query>             Find icons; --sheet out.png saves a numbered contact sheet
  design <source...>         Compare sources x styles in one grid: --styles "a|b" --out grid.png
  preview <source>           Mock it up on a taskbar, desktop, phone...: --out scenes.png
  make <source>              Write files: --formats ico,png,icns,web,pngset
  studio [source]            Open the visual editor in your browser
  sheet <images...>          Put image files side by side: --out sheet.png

Apps and taskbar (Windows)
  apps [text]                Find installed apps
  info <app...>              An app's shortcuts and pin state
  apply <app...>             Put an icon on apps: --source <ref|app> [--style "..."] [--pin]
  status                     Pinned apps in order
  pins                       Pin, unpin and reorder in one Explorer restart:
                             --pin a,b --unpin c --order a,b --position N [--dry-run]
  refresh                    Restart Explorer so pinned icons reload
  restore <app...> | --all   Put original icons back
  restore-pins               Put the pinned-apps list back: --from last|original

Desktop (Windows)
  desktop list | move | arrange | size | options | system | apply | restore | save | load

Checks (Windows)
  doctor                     Check this PC (changes nothing)
  capture [taskbar|desktop|screen]

Testing (any OS)
  report                     Environment and self-test, safe to share in a test report

Sources: an Iconify id (mdi:music), an image file, raw <svg>, or app:<App name>.
Styles: --style "color=white bg=#2d5ba6 shape=squircle shadow", or --color, --bg, --shape,
--radius, --padding, --shadow. Details: iconwright <command> --help. Version: iconwright --version`;
export async function run(argv = process.argv) {
  try { const args = argv.slice(2), command = args.shift(); if (!command || ['help','--help','-h'].includes(command)) { console.log(help()); return 0; }
    if (['version','--version','-v'].includes(command)) { console.log(version); return 0; }
    const entry = commands.get(command); if (!entry) throw new Error(`unknown command: ${command}`);
    const result = await entry.handler(args); if (result) console.log(result); return 0;
  } catch (error) { console.error((error.message || String(error)).split(/\r?\n/, 1)[0]); return 1; }
}
