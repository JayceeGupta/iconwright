// Every MCP tool, as data: name, schema, annotations and handler. mcp.mjs registers them;
// the docs site builds its tool reference from the same table, so the two never drift.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { searchIconsDetailed } from './source.mjs';
import { makeIcon, renderMaster, FORMATS, defaultOutDir, parseStyle, formatStyle, STYLE_HELP } from './render.mjs';
import { searchSheet, designGrid, MAX_CELLS } from './design.mjs';
import { renderScenes, SCENES, DEFAULT_SCENES } from './scenes.mjs';
import { applyIcons, applyDesktopIcon } from './apply.mjs';
import { atomicWrite } from './fsutil.mjs';

// ---------- annotations (only values that differ from MCP's defaults:
// readOnly false, destructive true, idempotent false, openWorld true) ----------
const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { destructiveHint: false, idempotentHint: true, openWorldHint: false };
const CHANGE = { idempotentHint: true, openWorldHint: false };
const RESTART = { openWorldHint: false };

// ---------- shared argument shapes ----------
const source = z.string().min(1).describe('Iconify id ("mdi:music"), image file, raw <svg>, or "app:<name>" (an installed app\'s icon; Windows)');
const style = { style: z.string().optional().describe(STYLE_HELP) };
const outDir = z.string().optional().describe('Output folder (default: iconwright\'s icons folder)');
const apps = z.array(z.string().min(1)).min(1).describe('App names (as find_apps shows them) or AppIDs');
const restartOpts = {
  noRestart: z.boolean().optional().describe('Write the change but don\'t restart Explorer (shows after the next restart)'),
  restartCooldown: z.number().int().min(0).max(600).optional().describe('Wait until this many seconds since the last Explorer restart (helps taskbar styling tools)'),
};
// App names without an "app:" prefix, each once (a repeated name would pin an app twice).
const appNames = (list) => [...new Set(list.map((s) => s.replace(/^app:/i, '').trim()))];

// ---------- result helpers ----------
const json = (value) => ({ json: value });
const withImage = (value, png) => ({ json: value, image: png });

// "app:<name>" sources become the app's icon image (Windows); others pass through.
async function resolveSources(list, ctx) {
  const wanted = list.filter((s) => /^app:/i.test(s));
  if (!wanted.length) return list;
  if (!ctx.isWindows) throw new Error('"app:" sources read installed apps\' icons and only work on Windows');
  const images = await ctx.win('app-icon-image', { app: appNames(wanted) });
  const byIndex = new Map(wanted.map((s, i) => [s, images[i]]));
  return list.map((s) => {
    const img = byIndex.get(s);
    if (!img) return s;
    if (img.error) throw new Error(`${s}: ${img.error}`);
    return img.image;
  });
}

// The user's pinned taskbar apps as scene neighbors (Windows); null when unavailable.
// Extracting ten app icons takes a few seconds, so the list is reused for two minutes.
let neighborCache = { at: 0, list: null };
async function myNeighbors(ctx) {
  if (Date.now() - neighborCache.at < 120_000) return neighborCache.list;
  const list = await readNeighbors(ctx);
  neighborCache = { at: Date.now(), list };
  return list;
}
async function readNeighbors(ctx) {
  try {
    const status = await ctx.win('status');
    const names = status.pins.map((p) => p.name).filter((n) => n && n !== '(unknown)').slice(0, 10);
    if (!names.length) return null;
    const images = await ctx.win('app-icon-image', { app: names });
    const list = images.filter((i) => i.image).map((i) => ({ name: i.app, source: i.image }));
    return list.length >= 3 ? list : null;
  } catch { return null; }
}

// ---------- the tools ----------
export const TOOLS = [
  // icons (any OS)
  {
    name: 'search_icons', group: 'Design', title: 'Search icons',
    description: 'Search 200,000+ open-source icons (Iconify). Returns ids and, by default, a numbered contact sheet: picture N is icons[N-1]. Brand logos: "simple-icons:<brand>".',
    input: {
      query: z.string().min(1).describe('What to look for, e.g. "music note"'),
      limit: z.number().int().min(1).max(64).optional().describe('Results (default 24)'),
      start: z.number().int().min(0).optional().describe('Skip this many results (next page)'),
      collections: z.array(z.string()).optional().describe('Only these icon sets, e.g. ["mdi", "ph", "lucide"]'),
      palette: z.enum(['mono', 'color']).optional().describe('mono: single-color icons (recolor cleanly); color: multicolor'),
      preview: z.boolean().optional().describe('Include the contact sheet (default true)'),
    },
    annotations: { ...READ, openWorldHint: true },
    async handler({ query, limit = 24, start = 0, collections, palette, preview = true }) {
      const r = await searchIconsDetailed(query, { limit, start, collections, palette });
      const licenses = Object.fromEntries(Object.entries(r.collections).map(([k, v]) => [k, v.license]));
      const out = { icons: r.icons, more: r.total > start + r.icons.length, licenses };
      if (!preview || !r.icons.length) return json(out);
      const sheet = await searchSheet(r.icons);
      if (sheet.missing.length) out.missing = sheet.missing;
      return withImage(out, sheet.png);
    },
  },
  {
    name: 'design_icons', group: 'Design', title: 'Compare designs',
    description: `Compare options in one small image: rows A, B, … = sources, columns 1, 2, … = styles; each cell shows the icon large and at 24 px on dark and light. Pass a picked cell's (e.g. "B2") source and style to preview_icon, make_icon or app_apply_icon. Max ${MAX_CELLS} cells. Nothing is saved.`,
    input: {
      sources: z.array(source).min(1).max(12).describe('Rows: icon ids, files, raw <svg> or "app:<name>"'),
      styles: z.array(z.string()).min(1).max(8).optional().describe('Columns: style strings (see make_icon), e.g. ["color=white", "color=white bg=#1DB954 shape=squircle"]'),
    },
    annotations: { ...READ, openWorldHint: true },
    async handler({ sources, styles = [''] }, ctx) {
      const parsed = styles.map(parseStyle);   // bad styles fail before any rendering
      const r = await designGrid({ sources: await resolveSources(sources, ctx), styles: parsed });
      return withImage({
        rows: sources.map((src, i) => `${'ABCDEFGHIJKL'[i]}: ${src}`),
        columns: parsed.map((st, i) => `${i + 1}: ${formatStyle(st) || '(as is)'}`),
        ...(r.errors ? { errors: r.errors } : {}),
      }, r.png);
    },
  },
  {
    name: 'preview_icon', group: 'Design', title: 'Preview in context',
    description: `Mock up an icon where it lives: ${SCENES.join(', ')} (sizes = true pixels). On Windows, taskbar and start show the user's own pinned apps around it. Use before applying: catches icons that vanish on light or dark. Nothing is saved.`,
    input: {
      source, ...style,
      label: z.string().optional().describe('App name shown under the icon'),
      scenes: z.array(z.enum(SCENES)).min(1).optional().describe(`Default ${DEFAULT_SCENES.join(', ')}`),
      scale: z.union([z.literal(1), z.literal(1.5), z.literal(2)]).optional().describe('Display scaling to mimic (default 1)'),
    },
    annotations: { ...READ, openWorldHint: true },
    async handler({ source: src, label, scenes, scale, style: st }, ctx) {
      const look = parseStyle(st);
      const [resolved] = await resolveSources([src], ctx);
      const master = await renderMaster({ source: resolved, ...look });
      const wantsNeighbors = !scenes || scenes.some((n) => n === 'taskbar' || n === 'start');
      const neighbors = ctx.isWindows && wantsNeighbors ? await myNeighbors(ctx) : null;
      const name = label || (/^app:/i.test(src) ? src.slice(4) : 'My App');
      const png = await renderScenes({ master, label: name, scenes, scale, neighbors });
      return withImage({ scenes: scenes ?? DEFAULT_SCENES, neighbors: neighbors ? 'your pinned apps' : 'samples' }, png);
    },
  },
  {
    name: 'make_icon', group: 'Design', title: 'Make icon files',
    description: `Write icon files: ico (Windows, 16-256 px), png, icns (macOS), web (favicons, touch + PWA icons, manifest, head.html), pngset (16-1024 px). Default ico + png. Returns paths and a preview (48 and 24 px on dark and light).`,
    input: {
      source, ...style,
      name: z.string().optional().describe('File name (default "icon")'), outDir,
      formats: z.array(z.enum(FORMATS)).min(1).optional().describe('Default ["ico","png"]'),
      pngSize: z.number().int().min(16).max(1024).optional().describe('Size of the png (default 256)'),
      preview: z.boolean().optional().describe('Return the preview image (default true)'),
    },
    annotations: { ...WRITE, openWorldHint: true },
    async handler({ source: src, preview = true, style: st, ...o }, ctx) {
      const look = parseStyle(st);
      const [resolved] = await resolveSources([src], ctx);
      const made = await makeIcon({ source: resolved, ...look, ...o });
      const { preview: file, ...paths } = made;
      return preview && file ? withImage(paths, await readFile(file)) : json(paths);
    },
  },
  {
    name: 'open_studio', group: 'Design', title: 'Open the studio',
    description: 'Open iconwright studio (a visual icon editor) in the user\'s browser, preloaded with a source and style, to fine-tune by hand. Its "Copy for your agent" button gives the user the exact source and style to paste back.',
    input: {
      source: source.optional(), ...style,
      label: z.string().optional().describe('App name shown in the scenes'),
      open: z.boolean().optional().describe('Open the browser (default true); false just returns the link'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler({ source: src, style: st, label, open = true }, ctx) {
      if (st) parseStyle(st);
      const { startStudio, openBrowser } = await import('./studio.mjs');
      const studio = await startStudio({ win: ctx.isWindows ? ctx.win : null, exclusive: ctx.exclusive });
      const url = studio.url({ source: src, style: st, label });
      if (open) openBrowser(url);
      return json({ url, note: 'Runs while this MCP server runs; local only.' });
    },
  },

  // apps and taskbar (Windows)
  {
    name: 'find_apps', group: 'Apps and taskbar', windows: true, title: 'Find apps',
    description: 'Find installed apps (Start menu). With query: matching names and AppIDs. With apps: details for each (AppID, Start menu and pinned shortcuts, Store app or not).',
    input: {
      query: z.string().optional().describe('Part of the name; omit both to list the first 50'),
      apps: apps.optional(),
    },
    annotations: READ,
    async handler({ query, apps: list }, ctx) {
      if (query && list) throw new Error('give query or apps, not both');
      return json(list ? await ctx.win('info', { app: appNames(list) }) : await ctx.win('apps', { query }));
    },
  },
  {
    name: 'app_apply_icon', group: 'Apps and taskbar', windows: true, title: 'Set app icons',
    description: 'Put an icon on apps (Start menu + pinned shortcuts; open windows update live). Give source (source "app" restyles each app\'s own icon, e.g. all white) or icon (existing .ico). pin:true also pins. If the result has a hint, taskbar_refresh once after all changes. Undo: restore_icons.',
    input: {
      apps,
      source: z.string().min(1).optional().describe('"app" (each app\'s own icon), Iconify id, image file or raw <svg>'),
      icon: z.string().optional().describe('Existing .ico/.exe/.dll to use as is'),
      iconIndex: z.number().int().optional().describe('Icon index inside icon (default 0)'),
      ...style, name: z.string().optional().describe('File name (single app)'), outDir,
      pin: z.boolean().optional().describe('Also pin the apps'),
      refresh: z.boolean().optional().describe('Restart Explorer at the end if pinned icons need it'),
      ...restartOpts,
    },
    annotations: CHANGE,
    async handler({ apps: list, icon, iconIndex, style: st, ...o }, ctx) {
      Object.assign(o, parseStyle(st));
      if (Boolean(o.source) === Boolean(icon)) throw new Error('give exactly one of source (to make an icon) or icon (an existing .ico)');
      if (icon) {
        const names = appNames(list), results = [];
        for (const app of names) results.push({ app, ...(await ctx.win('set-icon', { app, icon, iconIndex })) });
        const out = { results };
        const restart = { noRestart: o.noRestart, restartCooldown: o.restartCooldown };
        if (o.pin) out.pin = await ctx.win('pins', { pin: names, ...restart });
        if (o.refresh && !out.pin?.restarted) out.refresh = await ctx.win('refresh', restart);
        return json(out);
      }
      const r = await applyIcons({ ...o, apps: appNames(list) }, ctx.win);
      const { preview, ...rest } = r;
      return preview ? withImage(rest, await readFile(preview)) : json(rest);
    },
  },
  {
    name: 'taskbar_status', group: 'Apps and taskbar', windows: true, title: 'Taskbar status',
    description: 'Pinned taskbar apps in order, with each one\'s icon file.',
    annotations: READ,
    handler: async (_, ctx) => json(await ctx.win('status')),
  },
  {
    name: 'taskbar_pins', group: 'Apps and taskbar', windows: true, title: 'Pin, unpin, reorder',
    description: 'Change pinned apps in ONE Explorer restart: pin, unpin and move apps in a single call (the taskbar blinks; open File Explorer windows close). dryRun shows the resulting order without changing anything. Backed up first (undo: taskbar_restore_backup).',
    input: {
      pin: apps.optional().describe('Apps to pin'),
      unpin: apps.optional().describe('Apps to unpin'),
      order: apps.optional().describe('Pinned apps (incl. ones being pinned) to move to position, in this order'),
      position: z.number().int().optional().describe('Where order goes: 0 = first (default), -1 = last'),
      icon: z.string().optional().describe('An .ico for the new pin (single app)'),
      dryRun: z.boolean().optional().describe('Only report what would happen'),
      ...restartOpts,
    },
    annotations: RESTART,
    async handler({ pin, unpin, order, ...o }, ctx) {
      if (!pin && !unpin && !order) throw new Error('give pin, unpin and/or order');
      return json(await ctx.win('pins', { pin: pin && appNames(pin), unpin: unpin && appNames(unpin), order: order && appNames(order), ...o }));
    },
  },
  {
    name: 'taskbar_refresh', group: 'Apps and taskbar', windows: true, title: 'Reload taskbar icons',
    description: 'Restart Explorer once so pinned icons reload. Only when a result says so; once, after all changes.',
    input: { restartCooldown: restartOpts.restartCooldown },
    annotations: RESTART,
    handler: async (o, ctx) => json(await ctx.win('refresh', o)),
  },
  {
    name: 'taskbar_restore_backup', group: 'Apps and taskbar', windows: true, title: 'Restore pinned apps',
    description: 'Put the pinned-apps list back: "last" = before the latest pin change, "original" = before iconwright\'s first. Restarts Explorer.',
    input: { from: z.enum(['last', 'original']).optional().describe('Default "last"') },
    annotations: RESTART,
    handler: async ({ from }, ctx) => json(await ctx.win('restore-pins', { value: from ?? 'last' })),
  },

  // desktop (Windows, all live)
  {
    name: 'desktop_info', group: 'Desktop', windows: true, title: 'Desktop info',
    description: 'Desktop icons with positions (px), icon size, options, grid spacing, monitors and system icon visibility.',
    annotations: READ,
    handler: async (_, ctx) => json(await ctx.win('desktop-list')),
  },
  {
    name: 'desktop_move', group: 'Desktop', windows: true, title: 'Move desktop icons',
    description: 'Move desktop icons to positions (snap to the grid). Coordinates as in desktop_info.',
    input: { moves: z.array(z.object({ item: z.string().min(1).describe('Name or path from desktop_info'), x: z.number().int(), y: z.number().int() }).strict()).min(1).describe('Each: item (name or path from desktop_info), x and y in pixels') },
    annotations: CHANGE,
    async handler({ moves }, ctx) {
      const results = [];
      for (const m of moves) results.push(await ctx.win('desktop-move', m));
      return json(results.length === 1 ? results[0] : { results });
    },
  },
  {
    name: 'desktop_arrange', group: 'Desktop', windows: true, title: 'Arrange desktop',
    description: 'Line up the icons on one monitor from a corner; other monitors stay put. Save a layout first (desktop_layout).',
    input: {
      itemsFirst: z.array(z.string()).optional().describe('Items to place first, in order; the rest follow'),
      by: z.enum(['name', 'type', 'none']).optional().describe('Sort the rest (default name)'),
      corner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional(),
      flow: z.enum(['columns', 'rows']).optional().describe('Fill columns (default) or rows first'),
      monitor: z.number().int().min(0).optional().describe('0 = primary (default)'),
    },
    annotations: CHANGE,
    handler: async ({ itemsFirst, ...o }, ctx) => json(await ctx.win('desktop-arrange', { item: itemsFirst, ...o })),
  },
  {
    name: 'desktop_settings', group: 'Desktop', windows: true, title: 'Desktop settings',
    description: 'Icon size, auto-arrange, snap to grid, show/hide all icons, and which system icons (This PC, Recycle Bin, …) show. Only the options you give change.',
    input: {
      iconSize: z.union([z.enum(['small', 'medium', 'large', 'xl', 'huge']), z.number().int().min(16).max(256)]).optional().describe('small 32, medium 48, large 96, xl 128, huge 256, or px'),
      autoArrange: z.boolean().optional(), snapToGrid: z.boolean().optional(),
      showIcons: z.boolean().optional().describe('false hides every desktop icon'),
      showSystemIcons: z.array(z.enum(['this-pc', 'recycle-bin', 'user-files', 'network', 'control-panel'])).optional(),
      hideSystemIcons: z.array(z.enum(['this-pc', 'recycle-bin', 'user-files', 'network', 'control-panel'])).optional(),
    },
    annotations: CHANGE,
    async handler(o, ctx) {
      const out = {};
      const onOff = (v) => (v == null ? undefined : v ? 'on' : 'off');
      if (o.iconSize != null) out.iconSize = await ctx.win('desktop-size', { value: o.iconSize });
      if ([o.autoArrange, o.snapToGrid, o.showIcons].some((v) => v != null)) {
        out.options = await ctx.win('desktop-options', { autoArrange: onOff(o.autoArrange), snapToGrid: onOff(o.snapToGrid), showIcons: onOff(o.showIcons) });
      }
      if (o.showSystemIcons?.length) out.shown = await ctx.win('desktop-system', { item: o.showSystemIcons, value: 'show' });
      if (o.hideSystemIcons?.length) out.hidden = await ctx.win('desktop-system', { item: o.hideSystemIcons, value: 'hide' });
      if (!Object.keys(out).length) throw new Error('give at least one setting');
      return json(out);
    },
  },
  {
    name: 'desktop_apply_icon', group: 'Desktop', windows: true, title: 'Set desktop icon',
    description: 'Change the icon of a desktop shortcut, web link, folder or system icon (this-pc, recycle-bin, …). Give source (makes an icon) or icon (existing .ico). Plain files can\'t have their own icon. Undo: restore_icons.',
    input: {
      item: z.string().min(1).describe('Name or path from desktop_info, or a system icon name'),
      source: source.optional(), icon: z.string().optional().describe('Existing .ico/.exe/.dll'),
      iconIndex: z.number().int().optional(), ...style, name: z.string().optional(), outDir,
    },
    annotations: CHANGE,
    async handler({ style: st, ...args }, ctx) {
      Object.assign(args, parseStyle(st));
      if (args.source) [args.source] = await resolveSources([args.source], ctx);
      const r = await applyDesktopIcon(args, ctx.win);
      const { preview, ...rest } = r;
      return preview ? withImage(rest, await readFile(preview)) : json(rest);
    },
  },
  {
    name: 'desktop_layout', group: 'Desktop', windows: true, title: 'Save or load desktop layout',
    description: 'save: icon positions, size and auto-arrange to a JSON file. load: put icons back where it had them (reports items that are gone).',
    input: {
      action: z.enum(['save', 'load']),
      file: z.string().optional().describe('Default: iconwright\'s desktop-layout.json'),
    },
    annotations: CHANGE,
    async handler({ action, file }, ctx) {
      const target = file || path.join(path.dirname(defaultOutDir()), 'desktop-layout.json');
      return json(await ctx.win(action === 'save' ? 'desktop-save' : 'desktop-load', { file: target }));
    },
  },

  // undo and checks
  {
    name: 'restore_icons', group: 'Undo and checks', windows: true, title: 'Restore icons',
    description: 'Put original icons back: on apps, on desktop items, or all:true for everything iconwright changed (pins excepted; see taskbar_restore_backup). If needsRefresh, call taskbar_refresh once.',
    input: {
      apps: apps.optional(),
      desktopItems: z.array(z.string().min(1)).min(1).optional().describe('Desktop items or system icon names'),
      all: z.boolean().optional(),
    },
    annotations: CHANGE,
    async handler({ apps: list, desktopItems, all }, ctx) {
      if (all) return json(await ctx.win('restore-all'));
      if (!list && !desktopItems) throw new Error('give apps, desktopItems, or all:true');
      const out = {};
      if (list) out.apps = await ctx.win('restore', { app: appNames(list) });
      if (desktopItems) out.desktop = await ctx.win('desktop-restore', { item: desktopItems });
      return json(out);
    },
  },
  {
    name: 'doctor', group: 'Undo and checks', windows: true, title: 'Check this PC',
    description: 'Read-only check that the taskbar and desktop tools can work here (Windows, PowerShell, pin list, backups, taskbar mods).',
    annotations: READ,
    handler: async (_, ctx) => json(await ctx.win('doctor')),
  },
  {
    name: 'capture', group: 'Undo and checks', windows: true, title: 'Screenshot',
    description: 'See a change: the taskbar (default), the desktop icons (drawn even under windows; no wallpaper), or the screen. Fails while the screen is locked.',
    input: {
      what: z.enum(['taskbar', 'desktop', 'screen']).optional(),
      maxWidth: z.number().int().min(0).max(4000).optional().describe('Scale down to this width (default 1600; 0 = full)'),
    },
    annotations: READ,
    async handler({ what, maxWidth }, ctx) {
      const shot = await ctx.win('capture', { value: what ?? 'taskbar', maxWidth: maxWidth ?? 1600 });
      return withImage(shot, await readFile(shot.path));
    },
  },
];

// ---------- prompts (slash commands in clients that support them) ----------
export const PROMPTS = [
  {
    name: 'restyle-taskbar', title: 'Restyle my taskbar icons',
    description: 'Make every pinned taskbar icon match one look (e.g. all white).',
    args: { look: z.string().describe('The look, e.g. "white", "black on white circles", "pastel squircles"') },
    text: ({ look }) => `Restyle all my pinned taskbar icons to this look: ${look}.
1. taskbar_status for the pinned app names.
2. If the look is exact (like "white"), go to step 4. Otherwise design_icons with 2-3 of the apps as "app:<name>" sources and 3-4 style columns that fit the look; show me the grid and let me pick a column.
3. preview_icon one app with the chosen style (taskbar and sizes scenes) so I see it on light and dark.
4. One app_apply_icon call with all the apps, source "app" and the style; taskbar_refresh once if the result asks; then capture the taskbar.
Tell me how to undo (restore_icons with all:true).`,
  },
  {
    name: 'design-icon', title: 'Design an icon',
    description: 'Design an icon from an idea, compare options, preview it in context, then export or apply it.',
    args: {
      idea: z.string().describe('What the icon should show or feel like'),
      app: z.string().optional().describe('Windows app to put it on (optional)'),
    },
    text: ({ idea, app }) => `Design an icon: ${idea}.
1. search_icons for 2-3 different phrasings; pick 4-6 promising ids from the sheets.
2. design_icons: those ids as rows, 3-4 style columns (plain, on a colored squircle, gradient, inverted). Show me the grid; I'll pick a cell like "B2".
3. Iterate: change only what I ask (color, shape, padding) with another small design_icons grid.
4. preview_icon the winner${app ? ` labeled "${app}"` : ''} in the scenes that fit where it will be used.
5. ${app && process.platform === 'win32' ? `When I confirm, app_apply_icon on "${app}" with that source and style.` : 'When I confirm, make_icon with the formats I need (ask: Windows .ico, macOS .icns, web favicons).'}`,
  },
  {
    name: 'tidy-desktop', title: 'Tidy my desktop',
    description: 'Back up the desktop layout, then arrange icons neatly.',
    args: { how: z.string().optional().describe('e.g. "by type, top-right"') },
    text: ({ how }) => `Tidy my desktop${how ? ` (${how})` : ''}.
1. desktop_info, then desktop_layout save (a backup).
2. Propose an arrangement in one sentence; when I agree, desktop_arrange.
3. capture the desktop to show me. Undo is desktop_layout load.`,
  },
  {
    name: 'undo-everything', title: 'Undo everything',
    description: 'Put back every icon iconwright changed and, if wanted, the original pinned apps.',
    args: {},
    text: () => `Undo iconwright's changes: restore_icons with all:true, then ask me whether to also restore the original pinned apps (taskbar_restore_backup from "original"). Call taskbar_refresh once at the end only if needed, then capture the taskbar.`,
  },
];

export const INSTRUCTIONS = `iconwright designs icons on any OS and changes the Windows taskbar and desktop.
- Exploring a look: search_icons (numbered sheet) → design_icons (rows = sources, columns = style strings; user picks a cell like "B2") → preview_icon (the icon on real surfaces) → make_icon (files) or app_apply_icon. Show each image and let the user choose; change one thing per round. open_studio hands the design to the user to adjust by hand.
- A specific look: act directly. "All my taskbar icons white": taskbar_status, then ONE app_apply_icon with every name, source "app", style "color=white".
- Styles are strings: "color=white bg=#2d5ba6 shape=squircle shadow". "app:<App name>" as a source is an installed app's icon (Windows).
- taskbar_pins does pin, unpin and order in ONE call (one Explorer restart: the taskbar blinks, File Explorer windows close); dryRun first when the order matters. Exact names: find_apps or taskbar_status.
- If a result has a refresh hint, call taskbar_refresh once after all changes. Save desktop_layout before desktop_arrange.
- Undo: restore_icons, taskbar_restore_backup, desktop_layout load. capture shows results; doctor diagnoses failures.`;

/** The tools as MCP lists them: name, title, description, input JSON Schema, annotations. */
export function listedTools(isWindows = process.platform === 'win32') {
  return TOOLS.filter((t) => isWindows || !t.windows).map((t) => {
    const { $schema, ...inputSchema } = z.toJSONSchema(z.object(t.input ?? {}).strict(), { target: 'draft-7', io: 'input' });
    return { name: t.name, title: t.title, description: t.description, inputSchema, annotations: t.annotations };
  });
}
