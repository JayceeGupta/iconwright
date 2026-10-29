# How it works

This page explains how iconwright does each thing, in plain terms. For byte-level details, see [Windows internals](windows-internals.md).

## The big picture

```text
 Claude Code ─┐
 Codex ───────┼──>  MCP server ─┐
 other agents ┘                 │
 you ─────────────>  CLI ───────┼──> icon engine (Node + sharp)        any OS
 you ─────────────>  studio ────┘     search, grids, scenes, export
                                │
                                └──> Windows layer (PowerShell + C#)   Windows only
                                        │
                                        ├─ shortcut files (.lnk, .url, desktop.ini)
                                        ├─ registry (pinned apps, system icons)
                                        └─ Explorer (desktop icon view, taskbar)
```

- The **MCP server**, the **CLI** and the **studio** are three front doors to the same code. Agents use MCP; people use the CLI or the studio. The MCP tools are defined once, as data, in `src/tools.mjs`; the docs' [tool reference](tools.md) is generated from the same table.
- The **icon engine** is plain Node.js, so it runs anywhere, including the hosted studio's server.
- The **Windows layer** is a PowerShell script plus a small C# helper. The helper is compiled once on first use and cached in `%LOCALAPPDATA%\iconwright\bin`. It does the low-level work: shortcut files, the pinned-apps list, the desktop view, icon extraction and screenshots.

### Speed: one PowerShell for the whole session

Starting PowerShell takes about a second. The CLI starts one per command, which is fine for people. The MCP server instead keeps **one PowerShell process running** and sends it requests as lines of JSON. Most calls then take 50 to 600 ms instead of 2 to 3 seconds. After any command that restarts Explorer, that process is retired and a fresh one starts on the next call, so nothing in it refers to the old Explorer. Requests run one at a time; a request that takes over 5 minutes stops the process and reports that the change may be incomplete.

### Strict inputs

Every MCP tool rejects arguments it doesn't know, and the CLI rejects unknown options. A typo like `colour` fails with an error instead of being silently ignored. Each tool also tells the client whether it only reads, changes something, or restarts Explorer.

## Making an icon

1. **Get the artwork.** An Iconify id like `simple-icons:spotify` is fetched from the [Iconify API](https://iconify.design); many ids are fetched together, one request per icon set, and kept in a disk cache. Files (SVG, PNG, JPEG, WebP, ICO) are read from disk; for an `.ico`, the largest image inside it is used. On Windows, `app:<name>` extracts an installed app's current icon at 256 px.
2. **Recolor** (optional). For SVGs, iconwright rewrites the fill and stroke colors, leaving masks and clip paths alone. For raster images, it paints every visible pixel the new color and keeps the transparency, so multicolored pictures become single-colored.
3. **Fit it.** Transparent edges are trimmed, then the artwork is centered on a 1024×1024 canvas with some padding. This recolored, trimmed artwork is cached in memory, so trying ten styles on one icon only does this work once.
4. **Background** (optional). A square, rounded square, squircle or circle, in a color or a CSS-style gradient, goes behind it, with an optional soft shadow under the artwork.
5. **Export.** The `.ico` holds nine sizes (16, 20, 24, 32, 40, 48, 64, 128 and 256 px), so Windows has a sharp image at every display scaling. The `.icns`, favicon set and PNG set are made from the same 1024 px master. A small **preview** (the icon at 48 and 24 px on dark and light) comes back with every result.

### Grids and scenes

Design grids, search sheets and scene mockups are drawn with the same engine. Text in them uses a bundled copy of the Inter font, so the images look the same on Windows, macOS, Linux and the hosted studio's server. Scene geometry follows each platform's published sizes: 24 px taskbar icons in a 48 px bar, 32 px Start icons, 48 px desktop icons, and the iOS and Android masks.

When an agent applies a new look, the icon file name gets a short code based on the style (for example `spotify-3fa9c1.ico`). Windows caches icons by file path, so a new name is the reliable way to make it show the new look.

## Changing an app's icon

Windows apps are found through the Start Menu: `apps` and `info` look up the app's name, its shortcut and its **AppUserModelID** (the ID Windows uses to group an app's windows on the taskbar).

`apply` then:

1. saves the current icon setting of each shortcut (in `state.json`, for `restore`),
2. points the app's **Start Menu shortcut** and its **pinned shortcut** at the new `.ico`,
3. tells Explorer the shortcuts changed.

Where the change shows up depends on the app:

- **Running apps with an AppUserModelID** (most modern apps, including Electron apps like VS Code): the taskbar button takes its icon from the Start Menu shortcut, so it **changes immediately**.
- **Pinned apps that aren't running, and older apps without an ID**: Explorer reads the pinned shortcut only when it starts. iconwright tells the agent with a `hint`, and one `refresh` (an Explorer restart) applies it. If several apps need it, the agent makes all the changes first and refreshes once.
- **Store apps**: the pinned icon changes. The running window may keep the app's own icon, because Store apps declare it in their package.

### Restyling an app's own icon

With `source: "app"`, iconwright starts from the icon the app had before iconwright changed it, or its current one if it hasn't, looking at the pinned shortcut first since that's what the taskbar shows. If that's an `.ico` file, it's used directly. If it's inside an `.exe` or `.dll`, the 256 px version is extracted with its transparency. For Store apps, Windows' shell provides the image. The result is recolored like any other source. Several apps are handled in one request, and the agent gets one image comparing them all.

## Pinning, unpinning and reordering

There's no official way for a program to pin apps to the Windows 11 taskbar. Windows has a pinning interface, but it ignores calls from outside Explorer itself, and the "Pin to taskbar" menu item can't be triggered by other programs.

What does work is editing the list Explorer saves its pins in. All pin changes in one request (pin some apps, unpin others, move some) are planned together and written in one go, so they cost one Explorer restart. It lives in the registry (`HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband`) as two binary values: one with the location of each pinned shortcut, one with a copy of each shortcut. Explorer only reads them at startup, so iconwright:

1. backs up the list (and the pinned shortcuts),
2. stops Explorer,
3. edits the list: adds, removes or reorders entries, keeping both values in step,
4. lets Explorer start again (Windows restarts it automatically) and waits until the taskbar is back,
5. checks the result.

New pins need three small tags Explorer adds when you pin by hand ("pinned by the user", the time, and the app's ID). Without them Explorer keeps the entry but never shows it. Finding that took a lot of experimenting; it's documented in [Windows internals](windows-internals.md).

### What keeps it safe

- **Backups.** `backups\original` is saved before iconwright's first change and kept forever. `backups\last` is replaced only after a change succeeds. `restore-pins` puts either one back. Backups are taken before any file is touched.
- **Strict reading.** If the list contains anything iconwright doesn't fully understand, it refuses to change it rather than risk dropping pins.
- **Rollback.** If anything fails, the original registry bytes and pinned shortcut files are put back before Explorer restarts.
- **Only the taskbar process restarts.** iconwright stops the one `explorer.exe` that owns the taskbar. If you've set File Explorer to open folders in a separate process, those windows stay open.
- **It checks the taskbar came back.** If it doesn't within 30 seconds, iconwright says so and explains how to start it, instead of reporting success.
- **One at a time.** A system-wide lock means two requests can never overlap, even if an agent sends them in parallel. Reads wait too, so they never see a half-restarted taskbar.
- **Works in a trimmed environment.** Some MCP clients start servers with very few environment variables. Without one of them (`PATHEXT`), Windows PowerShell silently refuses to run programs like `reg.exe`. iconwright fills these in, and `doctor` checks for it.
- **Styling check.** The taskbar color is sampled before and after the restart, to notice when a styling tool like TranslucentTB switched itself off. iconwright restarts it if so.

## The desktop

Explorer draws desktop icons in a normal folder view, and Windows offers a documented interface to control it (`IFolderView2`). iconwright uses it to:

- list icons and their positions, and move them,
- arrange them from any corner, sorted by name or type,
- change the icon size, auto-arrange, align-to-grid and "show desktop icons".

These changes are **live**: no restart. Positions snap to Windows' icon grid. iconwright asks Explorer to save the layout after every change, because Explorer normally only saves it when it shuts down cleanly.

Desktop **icons** are changed the standard way for each kind of item:

| Item | Where the icon is set |
|---|---|
| Shortcut (`.lnk`) | The shortcut's icon setting |
| Internet shortcut (`.url`) | Its `IconFile` line |
| Folder | A hidden `desktop.ini` inside the folder |
| This PC, Recycle Bin, Network, … | A per-user registry override (Recycle Bin gets both its empty and full icon) |

Showing and hiding the system icons uses the same setting as Windows' *Desktop icon settings* dialog.

## Screenshots

`capture taskbar` copies the taskbar area of the screen. `capture desktop` asks the desktop icon view to draw itself into an image, so it works even when windows cover the desktop (the wallpaper isn't included). Images are scaled down to at most 1600 px wide to keep them cheap for agents to read.

## Checks

`doctor` reads, without changing anything: the Windows and PowerShell versions, whether the helper loads, whether apps can be looked up, whether the pinned-apps list is in a format iconwright understands, whether there's a pin to copy from, whether the taskbar and desktop are reachable, which taskbar mods are running, and whether backups exist.

## Code map

| Path | What it does |
|---|---|
| `bin/iconwright.mjs`, `bin/iconwright-mcp.mjs` | Entry points. On first run they install dependencies. |
| `src/tools.mjs` | Every MCP tool and prompt, as data, plus the server instructions |
| `src/mcp.mjs` | MCP server: registers the tools, serves a compact tool list, runs changes one at a time |
| `src/cli.mjs`, `src/cli-win.mjs` | CLI commands |
| `src/render.mjs`, `src/color.mjs` | Icon engine: styles, style strings, colors and gradients, `.ico` export |
| `src/source.mjs`, `src/ico.mjs` | Artwork: Iconify search and fetch with a disk cache, files, `.ico` decoding |
| `src/design.mjs`, `src/scenes.mjs`, `src/draw.mjs` | Search sheets, design grids, scene mockups, and the drawing kit they share |
| `src/formats.mjs`, `src/zip.mjs` | `.icns`, favicon sets, PNG sets; zips for studio downloads |
| `src/studio.mjs`, `studio/`, `api/studio.mjs` | The studio: its HTTP API (local and hosted), its web page, and the hosted function |
| `src/sheet.mjs` | Side-by-side sheets of image files |
| `src/apply.mjs` | "Make an icon and apply it" for apps and desktop items |
| `src/report.mjs` | `iconwright report`: system details and a self-test for test reports |
| `bin/ensure-deps.mjs` | Installs dependencies on a fresh clone's first run; a no-op when installed from npm |
| `src/win.mjs` | Runs the Windows layer: one process per call (CLI) or a long-lived worker (MCP) |
| `src/args.mjs` | Strict CLI option parsing |
| `src/output.mjs` | Tidies results for agents (forward-slash paths, no empty fields) |
| `scripts/win/iconwright.ps1` | Windows layer: apps, icons, pins, backups, Explorer restarts, checks |
| `scripts/win/desktop.ps1` | Windows layer: desktop |
| `scripts/win/Iconwright.Win.cs` | C# helper: shortcuts, pinned-apps list, desktop view, screenshots |
| `skills/iconwright/SKILL.md` | Instructions Claude Code loads to use iconwright well |
