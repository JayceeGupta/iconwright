import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchIcons } from './source.mjs';
import { makeIcon } from './render.mjs';
import { makeSheet } from './sheet.mjs';
import { win as winOnce, WinWorker } from './win.mjs';
import { applyIcons, applyDesktopIcon } from './apply.mjs';
import { toJson } from './output.mjs';

const { version } = createRequire(import.meta.url)('../package.json');
const isWindows = process.platform === 'win32';

// Shared guidance for every MCP client (Claude Code also gets the longer skill).
const INSTRUCTIONS = `iconwright makes icons (any OS) and changes the Windows taskbar and desktop.
- Find exact app names with list_apps; app_info shows an app's shortcuts and pin state.
- Unsure how an icon will look? make_icon first and show its preview, then apply.
- "Make my taskbar icons white": taskbar_status for the pinned names, then one app_apply_icon call with all of them, source "app", color "white".
- taskbar_pin, taskbar_unpin, taskbar_reorder, taskbar_refresh and taskbar_restore_backup restart Windows Explorer (the taskbar blinks; open File Explorer windows close). Batch apps into one call; never loop.
- If a result has a hint about refresh, call taskbar_refresh once after all changes.
- Before rearranging a desktop, desktop_layout_save a backup.
- Undo: app_restore_icons / desktop_restore_icons for icons, restore_all_icons for everything, taskbar_restore_backup for pins.
- After visible changes, capture shows the result; doctor checks the PC when something fails.`;

const server = new McpServer({ name: 'iconwright', version }, { instructions: isWindows ? INSTRUCTIONS : 'iconwright makes icons. Windows taskbar and desktop tools are only offered on Windows.' });

// MCP calls share one long-lived PowerShell process (much faster); ICONWRIGHT_NO_WORKER=1 opts out.
const worker = isWindows && !process.env.ICONWRIGHT_NO_WORKER ? new WinWorker() : null;
const win = worker ? (command, options) => worker.call(command, options) : winOnce;

const imageContent = async (file) => ({ type: 'image', data: (await readFile(file)).toString('base64'), mimeType: 'image/png' });
const json = (value) => ({ content: [{ type: 'text', text: toJson(value) }] });
async function withImage(value, file) {
  const content = [{ type: 'text', text: toJson(value) }];
  if (file) content.push(await imageContent(file));
  return { content };
}

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const CHANGE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
const RESTART = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

// Strict schemas: a misspelled argument is an error, not silently ignored.
function tool(name, { title, description, input = {}, annotations }, handler) {
  server.registerTool(name, { title, description, inputSchema: z.object(input).strict(), annotations: { title, ...annotations } }, async (args) => {
    try { return await handler(args ?? {}); }
    catch (error) { return { content: [{ type: 'text', text: error?.message || String(error) }], isError: true }; }
  });
}
const winTool = isWindows ? tool : () => {};

// ---------- shared argument shapes ----------
const source = z.string().min(1).describe('Iconify id like "mdi:music" or "simple-icons:spotify", a .svg/.png/.jpg/.webp/.ico file path, or raw <svg> text');
const style = {
  color: z.string().optional().describe('Recolor the artwork: CSS color like "white", "#3b82f6", "rgb(…)", "hsl(…)"'),
  bg: z.string().optional().describe('Background color behind the artwork (default: transparent)'),
  shape: z.enum(['none', 'square', 'rounded', 'circle']).optional().describe('Background shape (default rounded when bg is set)'),
  radius: z.number().min(0).max(0.5).optional().describe('Corner radius for rounded, as a fraction of the size (default 0.22)'),
  padding: z.number().min(0).max(0.45).optional().describe('Space around the artwork, as a fraction (default 0.08, or 0.2 with a background)'),
};
const outDir = z.string().optional().describe('Folder for the files (default %LOCALAPPDATA%\\iconwright\\icons)');
const appList = z.array(z.string().min(1)).min(1).describe('App names (from list_apps) or AppIDs');
const restartOpts = {
  noRestart: z.boolean().optional().describe('Write the change without restarting Explorer; it shows after the next restart'),
  restartCooldown: z.number().int().min(0).max(600).optional().describe('Seconds to wait since the last Explorer restart (for taskbar styling tools like TranslucentTB)'),
};

// ---------- icons (any OS) ----------
tool('search_icons', {
  title: 'Search icons',
  description: 'Search Iconify\'s 200,000+ icons and return icon ids such as "mdi:music". For brand logos try "simple-icons:<brand>" directly.',
  input: { query: z.string().min(1).describe('What to look for, e.g. "music note"'), limit: z.number().int().min(1).max(100).optional().describe('Most results to return (default 20)') },
  annotations: { ...READ, openWorldHint: true },
}, async ({ query, limit }) => json(await searchIcons(query, limit ?? 20)));

tool('make_icon', {
  title: 'Make icon',
  description: 'Make a Windows .ico (256-16 px), a preview PNG and a PNG from a source. Returns the paths and the preview image (the icon at 48 and 24 px on dark and light). Does not change the PC.',
  input: { source, ...style, name: z.string().optional().describe('File name (default "icon")'), outDir,
    pngSize: z.number().int().min(16).max(1024).optional().describe('Size of the extra PNG (default 256)') },
  annotations: { ...WRITE, openWorldHint: true },
}, async (args) => {
  const made = await makeIcon(args);
  return withImage({ ico: made.ico, preview: made.preview, png: made.pngs[0] }, made.preview);
});

tool('make_sheet', {
  title: 'Compare images',
  description: 'Put several images (PNG or ICO) side by side with their file names, to compare icon options. Returns the sheet image.',
  input: { files: z.array(z.string()).min(1).max(40).describe('Image files'), out: z.string().describe('Where to save the sheet PNG') },
  annotations: WRITE,
}, async ({ files, out }) => { const file = await makeSheet(files, out); return withImage({ path: file }, file); });

// ---------- apps and taskbar (Windows) ----------
winTool('list_apps', {
  title: 'Find apps',
  description: 'Find installed apps by name (Start menu). Returns exact names and AppIDs to use with the other tools.',
  input: { query: z.string().optional().describe('Part of the app name; omit to list all (first 50)') },
  annotations: READ,
}, async ({ query }) => json(await win('apps', { query })));

winTool('app_info', {
  title: 'App details',
  description: 'For each app: its AppID, Start Menu shortcuts, pinned shortcuts and whether it is a Store app.',
  input: { apps: appList },
  annotations: READ,
}, async ({ apps }) => json(await win('info', { app: apps })));

winTool('app_apply_icon', {
  title: 'Restyle app icons',
  description: 'Make an icon and put it on one or more apps (Start Menu and pinned shortcuts; running apps usually update live). Use source "app" to restyle each app\'s own icon, e.g. all pinned apps white. Returns per-app results and a preview image. pin:true also pins the apps (restarts Explorer once). If the result has a hint, call taskbar_refresh once after all changes. Undo with app_restore_icons.',
  input: {
    apps: appList,
    source: z.string().min(1).describe('"app" for each app\'s own icon, or an Iconify id, file path or raw <svg> used for all of them'),
    ...style,
    name: z.string().optional().describe('File name for the icon (single app only)'), outDir,
    pin: z.boolean().optional().describe('Also pin the apps to the taskbar'),
    refresh: z.boolean().optional().describe('Restart Explorer at the end if some pinned icons need it'),
    ...restartOpts,
  },
  annotations: CHANGE,
}, async (args) => { const r = await applyIcons(args, win); return withImage(r, r.preview); });

winTool('app_set_icon', {
  title: 'Set app icon from .ico',
  description: 'Put an existing .ico file on an app (Start Menu and pinned shortcuts). Undo with app_restore_icons.',
  input: { app: z.string().min(1), icon: z.string().min(1).describe('Path to an .ico, .exe or .dll'), index: z.number().int().optional().describe('Icon index inside the file (default 0)') },
  annotations: CHANGE,
}, async ({ app, icon, index }) => json(await win('set-icon', { app, icon, iconIndex: index })));

winTool('app_restore_icons', {
  title: 'Restore app icons',
  description: 'Put the original icons back on the named apps.',
  input: { apps: appList },
  annotations: CHANGE,
}, async ({ apps }) => json(await win('restore', { app: apps })));

winTool('taskbar_status', {
  title: 'Taskbar status',
  description: 'The pinned taskbar apps in order, with each one\'s icon file.',
  annotations: READ,
}, async () => json(await win('status')));

winTool('taskbar_pin', {
  title: 'Pin apps',
  description: 'Pin apps to the taskbar, in one Explorer restart. Put all apps in one call. The pinned-apps list is backed up first (undo: taskbar_restore_backup).',
  input: { apps: appList, icon: z.string().optional().describe('An .ico for the new pin (single app only)'), ...restartOpts },
  annotations: RESTART,
}, async ({ apps, ...o }) => json(await win('pin', { app: apps, ...o })));

winTool('taskbar_unpin', {
  title: 'Unpin apps',
  description: 'Unpin apps from the taskbar, in one Explorer restart. Put all apps in one call. Backed up first (undo: taskbar_restore_backup).',
  input: { apps: appList, ...restartOpts },
  annotations: RESTART,
}, async ({ apps, ...o }) => json(await win('unpin', { app: apps, ...o })));

winTool('taskbar_reorder', {
  title: 'Reorder taskbar',
  description: 'Move pinned apps (kept in the given order) to a position on the taskbar, in one Explorer restart. Backed up first.',
  input: { apps: appList, position: z.number().int().optional().describe('0 = first (default), -1 = last; counts other pinned apps'), ...restartOpts },
  annotations: RESTART,
}, async ({ apps, ...o }) => json(await win('reorder', { app: apps, ...o })));

winTool('taskbar_refresh', {
  title: 'Reload taskbar icons',
  description: 'Restart Explorer once so pinned icons reload. Only needed when a result says so; call it once after all changes.',
  input: { restartCooldown: restartOpts.restartCooldown },
  annotations: RESTART,
}, async (o) => json(await win('refresh', o)));

winTool('taskbar_restore_backup', {
  title: 'Restore pinned apps',
  description: 'Put the pinned-apps list back from a backup: "last" = before the most recent pin/unpin/reorder, "original" = before iconwright\'s first change. Restarts Explorer.',
  input: { from: z.enum(['last', 'original']).optional().describe('Default "last"') },
  annotations: RESTART,
}, async ({ from }) => json(await win('restore-pins', { value: from ?? 'last' })));

// ---------- desktop (Windows, all live) ----------
winTool('desktop_info', {
  title: 'Desktop info',
  description: 'Desktop icons with positions (px), icon size, options, grid spacing, monitor work areas and system icon visibility.',
  annotations: READ,
}, async () => json(await win('desktop-list')));

winTool('desktop_move', {
  title: 'Move desktop icon',
  description: 'Move one desktop icon. Positions snap to the icon grid; coordinates are those from desktop_info.',
  input: { item: z.string().min(1).describe('Name or path from desktop_info'), x: z.number().int(), y: z.number().int() },
  annotations: CHANGE,
}, async ({ item, x, y }) => json(await win('desktop-move', { item, x, y })));

winTool('desktop_arrange', {
  title: 'Arrange desktop',
  description: 'Line up the desktop icons on one monitor from a corner. Icons on other monitors stay put. Save a backup with desktop_layout_save first.',
  input: {
    itemsFirst: z.array(z.string()).optional().describe('Items (already on this monitor) to place first, in this order; the rest follow, sorted by "by"'),
    by: z.enum(['name', 'type', 'none']).optional().describe('Sort the rest by name (default), file type, or keep their current order'),
    corner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional().describe('Default top-left'),
    flow: z.enum(['columns', 'rows']).optional().describe('Fill columns (default) or rows first'),
    monitor: z.number().int().min(0).optional().describe('0 = primary (default); see monitors in desktop_info'),
  },
  annotations: CHANGE,
}, async ({ itemsFirst, ...o }) => json(await win('desktop-arrange', { item: itemsFirst, ...o })));

winTool('desktop_icon_size', {
  title: 'Desktop icon size',
  description: 'Set the desktop icon size.',
  input: { size: z.union([z.enum(['small', 'medium', 'large', 'xl', 'huge']), z.number().int().min(16).max(256)]).describe('small 32, medium 48, large 96, xl 128, huge 256, or pixels 16-256') },
  annotations: CHANGE,
}, async ({ size }) => json(await win('desktop-size', { value: size })));

winTool('desktop_options', {
  title: 'Desktop options',
  description: 'Turn desktop options on or off. Omitted options stay as they are.',
  input: {
    autoArrange: z.boolean().optional().describe('Windows keeps icons arranged automatically'),
    snapToGrid: z.boolean().optional().describe('Align icons to the grid'),
    showIcons: z.boolean().optional().describe('Show (true) or hide (false) all desktop icons'),
  },
  annotations: CHANGE,
}, async ({ autoArrange, snapToGrid, showIcons }) => {
  const onOff = (v) => (v == null ? undefined : v ? 'on' : 'off');
  return json(await win('desktop-options', { autoArrange: onOff(autoArrange), snapToGrid: onOff(snapToGrid), showIcons: onOff(showIcons) }));
});

winTool('desktop_system_icons', {
  title: 'Show or hide system icons',
  description: 'Show or hide This PC, Recycle Bin, your user folder, Network and Control Panel on the desktop.',
  input: { icons: z.array(z.enum(['this-pc', 'recycle-bin', 'user-files', 'network', 'control-panel'])).min(1), show: z.boolean() },
  annotations: CHANGE,
}, async ({ icons, show }) => json(await win('desktop-system', { item: icons, value: show ? 'show' : 'hide' })));

winTool('desktop_apply_icon', {
  title: 'Set desktop icon',
  description: 'Change the icon of a desktop shortcut, internet shortcut, folder, or a system icon (this-pc, recycle-bin, …). Give exactly one of source (makes an icon; returns a preview) or icon (an existing .ico). Plain files can\'t have their own icon. Undo with desktop_restore_icons.',
  input: {
    item: z.string().min(1).describe('Name or path from desktop_info, or a system icon name'),
    source: source.optional(), icon: z.string().optional().describe('Existing .ico, .exe or .dll'),
    iconIndex: z.number().int().optional().describe('Icon index inside the file (default 0)'), ...style, name: z.string().optional(), outDir,
  },
  annotations: CHANGE,
}, async (args) => { const r = await applyDesktopIcon(args, win); return withImage(r, r.preview); });

winTool('desktop_restore_icons', {
  title: 'Restore desktop icons',
  description: 'Put the original icons back on the named desktop items or system icons.',
  input: { items: z.array(z.string().min(1)).min(1) },
  annotations: CHANGE,
}, async ({ items }) => json(await win('desktop-restore', { item: items })));

winTool('desktop_layout_save', {
  title: 'Save desktop layout',
  description: 'Save icon positions, icon size and auto-arrange to a JSON file.',
  input: { file: z.string().min(1) },
  annotations: WRITE,
}, async ({ file }) => json(await win('desktop-save', { file })));

winTool('desktop_layout_load', {
  title: 'Load desktop layout',
  description: 'Put desktop icons back where a saved layout had them. Reports items that no longer exist.',
  input: { file: z.string().min(1) },
  annotations: CHANGE,
}, async ({ file }) => json(await win('desktop-load', { file })));

// ---------- undo and checks (Windows) ----------
winTool('restore_all_icons', {
  title: 'Restore all icons',
  description: 'Put back every app and desktop icon iconwright changed. Pins are not changed (see taskbar_restore_backup). If needsRefresh, call taskbar_refresh once.',
  annotations: CHANGE,
}, async () => json(await win('restore-all')));

winTool('doctor', {
  title: 'Check this PC',
  description: 'Read-only check that the taskbar and desktop tools can work here: Windows and PowerShell versions, pin-list format, backups, taskbar mods.',
  annotations: READ,
}, async () => json(await win('doctor')));

winTool('capture', {
  title: 'Screenshot',
  description: 'See the result of a change: a screenshot of the taskbar (default), the desktop icons (drawn even when windows cover them; no wallpaper), or the whole screen.',
  input: { what: z.enum(['taskbar', 'desktop', 'screen']).optional(), maxWidth: z.number().int().min(0).max(4000).optional().describe('Scale down to this width (default 1600; 0 = full size)') },
  annotations: READ,
}, async ({ what, maxWidth }) => {
  const shot = await win('capture', { value: what ?? 'taskbar', maxWidth: maxWidth ?? 1600 });
  return withImage(shot, shot.path);
});

process.on('exit', () => worker?.close());
await server.connect(new StdioServerTransport());
