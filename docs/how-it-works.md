# How it works

This page explains how iconwright does each thing, in plain terms. For byte-level details, see [Windows internals](windows-internals.md).

## The big picture

```text
 Claude Code ─┐
 Codex ───────┼──>  MCP server ─┐
 other agents ┘                 ├──> icon maker (Node + sharp)        any OS
 you ─────────────>  CLI ───────┘
                                └──> Windows layer (PowerShell + C#)   Windows only
                                        │
                                        ├─ shortcut files (.lnk, .url, desktop.ini)
                                        ├─ registry (pinned apps, system icons)
                                        └─ Explorer (desktop icon view, taskbar)
```

- The **MCP server** and the **CLI** are two front doors to the same code. Agents use MCP; people and scripts use the CLI. Both return compact JSON.
- The **icon maker** is plain Node.js, so it runs anywhere.
- The **Windows layer** is a PowerShell script plus a small C# helper. The helper is compiled once on first use and cached in `%LOCALAPPDATA%\iconwright\bin`. It does the low-level work: shortcut files, the pinned-apps list, the desktop view and screenshots.

## Making an icon

1. **Get the artwork.** An Iconify name like `simple-icons:spotify` is downloaded as SVG from the [Iconify API](https://iconify.design). Files (SVG, PNG, JPEG, WebP, ICO) are read from disk. For an `.ico`, the largest image inside it is used.
2. **Recolor** (optional). For SVGs, iconwright rewrites the fill and stroke colors. For raster images, it paints every visible pixel the new color and keeps the transparency, so multi-colored pictures become single-colored.
3. **Fit it.** Transparent edges are trimmed, then the artwork is centered on a 1024×1024 canvas with some padding.
4. **Background** (optional). A square, rounded square or circle in the `--bg` color goes behind it.
5. **Export.** The `.ico` holds seven sizes (256, 128, 64, 48, 32, 24 and 16 px), so Windows always has a sharp version. iconwright also writes a PNG and a **preview**: the icon at taskbar size on a dark and a light background, which agents can look at before applying.

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

## Pinning, unpinning and reordering

There's no official way for a program to pin apps to the Windows 11 taskbar. Windows has a pinning interface, but it ignores calls from outside Explorer itself, and the "Pin to taskbar" menu item can't be triggered by other programs.

What does work is editing the list Explorer saves its pins in. It lives in the registry (`HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband`) as two binary values: one with the location of each pinned shortcut, one with a copy of each shortcut. Explorer only reads them at startup, so iconwright:

1. backs up the list (and the pinned shortcuts),
2. stops Explorer,
3. edits the list: adds, removes or reorders entries, keeping both values in step,
4. lets Explorer start again (Windows restarts it automatically) and waits until the taskbar is back,
5. checks the result.

New pins need three small tags Explorer adds when you pin by hand ("pinned by the user", the time, and the app's ID). Without them Explorer keeps the entry but never shows it. Finding that took a lot of experimenting; it's documented in [Windows internals](windows-internals.md).

### What keeps it safe

- **Backups.** `backups\original` is saved before iconwright's first change and kept forever. `backups\last` is replaced before every successful change. `restore-pins` puts either one back.
- **Strict reading.** If the list contains anything iconwright doesn't fully understand, it refuses to change it rather than risk dropping pins.
- **Rollback.** If anything fails while Explorer is stopped, the original bytes are written back before Explorer restarts.
- **One at a time.** A system-wide lock means two changes can never overlap, even if an agent sends them in parallel.
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
| `src/mcp.mjs` | MCP server: tool definitions |
| `src/cli.mjs`, `src/cli-win.mjs` | CLI commands |
| `src/source.mjs`, `src/render.mjs`, `src/ico.mjs`, `src/sheet.mjs` | Icon maker |
| `src/apply.mjs` | "Make an icon and apply it" for apps and desktop items |
| `src/win.mjs` | Runs the Windows layer and reads its JSON |
| `src/output.mjs` | Tidies results for agents (forward-slash paths, no empty fields) |
| `scripts/win/iconwright.ps1` | Windows layer: apps, icons, pins, backups, Explorer restarts, checks |
| `scripts/win/desktop.ps1` | Windows layer: desktop |
| `scripts/win/Iconwright.Win.cs` | C# helper: shortcuts, pinned-apps list, desktop view, screenshots |
| `skills/iconwright/SKILL.md` | Instructions Claude Code loads to use iconwright well |
