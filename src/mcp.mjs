import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchIcons } from './source.mjs';
import { makeIcon } from './render.mjs';
import { makeSheet } from './sheet.mjs';
import { win } from './win.mjs';
import { applyIcon, applyDesktopIcon } from './apply.mjs';

const { version } = createRequire(import.meta.url)('../package.json');
const server = new McpServer({ name: 'iconwright', version });
const imageContent = async (file) => ({ type: 'image', data: (await readFile(file)).toString('base64'), mimeType: 'image/png' });
const jsonContent = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
function tool(name, description, schema, handler) {
  server.tool(name, description, schema, async (args) => {
    try { return await handler(args); }
    catch (error) { return { content: [{ type: 'text', text: error?.message || String(error) }], isError: true }; }
  });
}

// Taskbar and desktop tools change Windows itself, so they are only offered on Windows.
// Icon creation works on any OS.
const winTool = process.platform === 'win32' ? tool : () => {};

tool('search_icons', 'Search Iconify and return matching icon IDs.', { query: z.string(), limit: z.number().int().positive().optional() }, async ({ query, limit }) => jsonContent(await searchIcons(query, limit)));
tool('make_icon', 'Create an ICO, preview PNG, and 256px PNG from an icon source.', {
  source: z.string(), name: z.string().optional(), color: z.string().optional(), bg: z.string().optional(),
  shape: z.enum(['none', 'square', 'rounded', 'circle']).optional(), radius: z.number().optional(), padding: z.number().optional(), outDir: z.string().optional(), pngSize: z.number().int().min(16).max(1024).optional(),
}, async (args) => {
  const made = await makeIcon(args);
  return { content: [{ type: 'text', text: JSON.stringify({ ico: made.ico, preview: made.preview, png: made.pngs[0] }) }, await imageContent(made.preview)] };
});
tool('make_sheet', 'Create a labeled PNG contact sheet from image files.', { files: z.array(z.string()).min(1), out: z.string() }, async ({ files, out }) => {
  const file = await makeSheet(files, out);
  return { content: [{ type: 'text', text: JSON.stringify({ path: file }) }, await imageContent(file)] };
});
winTool('list_apps', 'List matching Start menu apps and AppUserModelIDs.', { query: z.string().optional() }, async ({ query }) => jsonContent(await win('apps', { query })));
winTool('app_info', 'Get shortcut and pin details for the named apps.', { apps: z.array(z.string()).min(1) }, async ({ apps }) => jsonContent(await win('info', { app: apps })));
winTool('taskbar_status', 'Show pinned taskbar items and their icons.', {}, async () => jsonContent(await win('status')));
winTool('apply_icon', 'Make an icon from source+style (or use an .ico) and apply it to an app: Start Menu + pinned shortcuts, live for running apps. pin:true also pins it (restarts Explorer). If the result has a hint, call refresh once after all changes.', {
  app: z.string(), source: z.string().optional(), icon: z.string().optional(), name: z.string().optional(), color: z.string().optional(), bg: z.string().optional(),
  shape: z.enum(['none', 'square', 'rounded', 'circle']).optional(), radius: z.number().optional(), padding: z.number().optional(), outDir: z.string().optional(), pin: z.boolean().optional(), refresh: z.boolean().optional(),
  noRestart: z.boolean().optional(), restartCooldown: z.number().optional(),
}, async (args) => jsonContent(await applyIcon(args)));
winTool('set_icon', 'Set an existing ICO on an app shortcut.', { app: z.string(), icon: z.string(), index: z.number().int().optional() }, async ({ app, icon, index }) => jsonContent(await win('set-icon', { app, icon, iconIndex: index })));
winTool('pin_apps', 'Pin apps; restarts Windows Explorer once per call; batch apps into one call.', { apps: z.array(z.string()).min(1), icon: z.string().optional(), noRestart: z.boolean().optional(), restartCooldown: z.number().optional() }, async ({ apps, ...opts }) => jsonContent(await win('pin', { app: apps, ...opts })));
winTool('unpin_apps', 'Unpin apps; restarts Windows Explorer once per call; batch apps into one call.', { apps: z.array(z.string()).min(1), noRestart: z.boolean().optional(), restartCooldown: z.number().optional() }, async ({ apps, ...opts }) => jsonContent(await win('unpin', { app: apps, ...opts })));
winTool('refresh', 'Restart Windows Explorer once so pinned icons of apps without an AppUserModelID reload. Call once after a batch of changes.', { restartCooldown: z.number().optional() }, async (o) => jsonContent(await win('refresh', o)));
winTool('restore_icons', 'Restore saved original icons for the named apps.', { apps: z.array(z.string()).min(1) }, async ({ apps }) => jsonContent(await win('restore', { app: apps })));
winTool('restore_all_icons', 'Put back every icon iconwright changed (apps and desktop items). If the result has needsRefresh, call refresh once.', {}, async () => jsonContent(await win('restore-all')));
winTool('restore_taskbar_backup', 'Undo pin/unpin/reorder changes from a backup: last = before the most recent change, original = before iconwright first changed the pin list. Restarts Explorer.', {
  from: z.enum(['last', 'original']).optional(),
}, async ({ from }) => jsonContent(await win('restore-pins', { value: from ?? 'last' })));
winTool('doctor', 'Read-only check that this PC can run the taskbar and desktop tools; reports Windows/PowerShell versions, pin-list format, backups and taskbar mods.', {}, async () => jsonContent(await win('doctor')));

winTool('reorder_taskbar', 'Move pinned apps in order to an index; restarts Explorer once.', {
  apps: z.array(z.string()).min(1), position: z.number().optional(), noRestart: z.boolean().optional(), restartCooldown: z.number().optional(),
}, async ({ apps, ...opts }) => jsonContent(await win('reorder', { app: apps, ...opts })));
winTool('desktop_info', 'List desktop items and settings. Desktop changes apply live.', {}, async () => jsonContent(await win('desktop-list')));
winTool('desktop_move', 'Move a desktop item; positions snap to the icon grid and changes apply live.', {
  item: z.string(), x: z.number(), y: z.number(),
}, async ({ item, x, y }) => jsonContent(await win('desktop-move', { item, x, y })));
winTool('desktop_arrange', 'Arrange desktop items live; positions snap to the icon grid.', {
  first: z.array(z.string()).optional(), by: z.enum(['name', 'type', 'none']).optional(), corner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional(), flow: z.enum(['columns', 'rows']).optional(),
}, async ({ first, by, corner, flow }) => jsonContent(await win('desktop-arrange', { item: first, by, corner, flow })));
winTool('desktop_icon_size', 'Set desktop icon size live.', { size: z.union([z.string(), z.number()]) }, async ({ size }) => jsonContent(await win('desktop-size', { value: size })));
winTool('desktop_options', 'Set desktop icon options live.', {
  autoArrange: z.boolean().optional(), snapToGrid: z.boolean().optional(), showIcons: z.boolean().optional(),
}, async ({ autoArrange, snapToGrid, showIcons }) => jsonContent(await win('desktop-options', {
  autoArrange: autoArrange == null ? undefined : (autoArrange ? 'on' : 'off'),
  snapToGrid: snapToGrid == null ? undefined : (snapToGrid ? 'on' : 'off'),
  showIcons: showIcons == null ? undefined : (showIcons ? 'on' : 'off'),
})));
winTool('desktop_system_icons', 'Show or hide desktop system icons live.', {
  icons: z.array(z.string()).min(1), show: z.boolean(),
}, async ({ icons, show }) => jsonContent(await win('desktop-system', { item: icons, value: show ? 'show' : 'hide' })));
winTool('desktop_apply_icon', 'Create or apply an ICO to a desktop item; source use returns a preview image. Changes apply live.', {
  item: z.string(), source: z.string().optional(), icon: z.string().optional(), name: z.string().optional(), color: z.string().optional(), bg: z.string().optional(),
  shape: z.enum(['none', 'square', 'rounded', 'circle']).optional(), radius: z.number().optional(), padding: z.number().optional(), outDir: z.string().optional(), iconIndex: z.number().int().optional(),
}, async (args) => {
  const result = await applyDesktopIcon(args);
  const content = [{ type: 'text', text: JSON.stringify(result) }];
  if (result.preview) content.push(await imageContent(result.preview));
  return { content };
});
winTool('desktop_restore_icons', 'Restore saved desktop item icons live.', { items: z.array(z.string()).min(1) }, async ({ items }) => jsonContent(await win('desktop-restore', { item: items })));
winTool('desktop_layout_save', 'Save the desktop layout to a file.', { file: z.string() }, async ({ file }) => jsonContent(await win('desktop-save', { file })));
winTool('desktop_layout_load', 'Load a desktop layout live; positions snap to the icon grid.', { file: z.string() }, async ({ file }) => jsonContent(await win('desktop-load', { file })));

await server.connect(new StdioServerTransport());
