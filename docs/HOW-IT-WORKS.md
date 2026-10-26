# How iconwright works

This guide maps the public interfaces to the implementation so maintainers can trace behavior across the Node and Windows layers. Windows behavior described here is grounded in [`windows-taskbar.md`](windows-taskbar.md), verified on Windows 11 26200 with StartAllBack 3.9.

## 1. Architecture overview

```text
Agent / user
  ├─ Claude Code plugin: skill + MCP config ─┐
  ├─ MCP client over stdio ──────────────────┼─> Node MCP/CLI adapters
  └─ CLI ────────────────────────────────────┘       │
                                               Node engine: source/render/apply
                                                     │ win.mjs spawns PowerShell
                                                     v
                                         scripts/win/iconwright.ps1 + desktop.ps1
                                                     │ Add-Type once; cached C# interop
                                                     v
                   Windows Shell COM / Win32 APIs <─> Explorer taskbar, desktop, registry
```

The Node engine is mostly portable: source acquisition, SVG/raster rendering, ICO assembly, previews, and contact sheets live in `src/source.mjs`, `render.mjs`, `ico.mjs`, and `sheet.mjs`. Windows operations are behind `src/win.mjs`, which rejects non-Windows hosts and invokes `scripts/win/iconwright.ps1` with arguments built by `buildWinArgs`.

For one `apply_icon` request, `src/mcp.mjs` validates the schema and calls `applyIcon` in `src/apply.mjs`. `applyIcon` requires exactly one of `source` or `icon`; for a source it hashes the serialized style (SHA-1, six hex characters), creates a uniquely named ICO plus a preview PNG under the icon directory. With `pin: true` it first calls `pin` (passing the icon, so the single Explorer restart already shows it), then invokes the PowerShell `set-icon` operation. `iconwright.ps1` resolves the Start Menu app, remembers original shortcut icons, changes Start Menu and pinned shortcut icon locations through `Iconwright.Lnk`, and calls `SHChangeNotify(UPDATEITEM)` for the item. A running app with an explicit AppUserModelID reads its Start Menu shortcut icon live. Apps without that ID may need one later `refresh`; the result's `needsRefresh`/`hint` communicates this. Pinning edits Taskband state while Explorer is stopped, then restarts Explorer once.

`Import-Interop` compiles `scripts/win/Iconwright.Win.cs` with PowerShell `Add-Type` only if the cached assembly is absent. The compiled DLL is stored under `%LOCALAPPDATA%\iconwright\bin`; subsequent calls reuse it.

## 2. Interaction surfaces

### Claude Code plugin

`.claude-plugin/plugin.json` declares the plugin and its `skills/iconwright/SKILL.md` workflow; `.claude-plugin/marketplace.json` publishes the `icon-playground` marketplace entry. `.mcp.json` launches `node ${CLAUDE_PLUGIN_ROOT}/bin/iconwright-mcp.mjs`, keeping the executable path relative to the installed plugin. `bin/iconwright-mcp.mjs` installs production dependencies with `npm install --omit=dev --no-audit --no-fund` on first launch if `node_modules/sharp` is missing, then imports the MCP server. This is the plugin's zero-setup dependency bootstrap. The skill prefers MCP, falls back to `node <plugin-root>/bin/iconwright.mjs`, and describes preview-before-apply and restore workflows.

### MCP server

`src/mcp.mjs` registers these tools. Inputs are Zod-validated; ordinary results are compact JSON in a text content block. `make_icon`, `make_sheet`, and source-based `desktop_apply_icon` also attach a PNG image content block (base64, `image/png`) for visual inspection. Tool exceptions become `isError: true` text results.

| Tool | Inputs | Result |
|---|---|---|
| `search_icons` | `query`, optional positive integer `limit` | Iconify icon ID list |
| `make_icon` | `source`; optional `name`, `color`, `bg`, `shape`, `radius`, `padding`, `outDir` | ICO, preview, 256px PNG paths plus preview image |
| `make_sheet` | nonempty `files`, `out` | Sheet path plus image |
| `list_apps` | optional `query` | Start Menu app names and AppIDs |
| `app_info` | nonempty `apps` | Resolved shortcut and pin details |
| `taskbar_status` | none | Pinned paths and current icon locations |
| `apply_icon` | `app`; optional `source` or `icon`, style fields, `pin`, `refresh`, `noRestart`, `restartCooldown` | Generated paths, set/pin results, possible refresh hint |
| `set_icon` | `app`, `icon`; optional integer `index` | Shortcut updates, skipped paths, refresh requirement |
| `pin_apps` | nonempty `apps`; optional `icon`, `noRestart`, `restartCooldown` | Pin result and Explorer restart report |
| `unpin_apps` | nonempty `apps`; optional `noRestart`, `restartCooldown` | Unpin result and restart report |
| `refresh` | optional `restartCooldown` | Explorer refresh/restart report |
| `restore_icons` | nonempty `apps` | Original icon restore results |
| `reorder_taskbar` | nonempty `apps`; optional `position`, `noRestart`, `restartCooldown` | Reordered pins and restart report |
| `desktop_info` | none | Desktop items, positions, size, and options |
| `desktop_move` | `item`, numeric `x`, numeric `y` | Moved item and grid-quantized position |
| `desktop_arrange` | optional `first`, `by` (`name/type/none`), `corner`, `flow` | Arranged desktop items |
| `desktop_icon_size` | `size` string or number | Applied size |
| `desktop_options` | optional booleans `autoArrange`, `snapToGrid`, `showIcons` | Current option values |
| `desktop_system_icons` | nonempty `icons`, boolean `show` | Visibility results |
| `desktop_apply_icon` | `item`; optional `source` or `icon`, style, `outDir`, `iconIndex` | Applied icon result; preview image when generated |
| `desktop_restore_icons` | nonempty `items` | Restored desktop icon results |
| `desktop_layout_save` | `file` | Saved item count/path |
| `desktop_layout_load` | `file` | Loaded layout result |

### CLI

`bin/iconwright.mjs` dispatches to `src/cli.mjs` and `src/cli-win.mjs`. `node bin/iconwright.mjs help` lists commands. The icon engine commands are `search <query> [--limit N]`, `make --source <ref> [--name --color --bg --shape --radius --padding --out]`, and `sheet <files...> --out <path>`. Windows commands are `apps [query]`, `info <app...>`, `set-icon <app> --icon f.ico [--index n]`, `apply <app> (--source ref [style] | --icon f.ico) [--pin]`, `pin <app...> [--icon f.ico] [--no-restart] [--cooldown s]`, `unpin <app...> [--no-restart] [--cooldown s]`, `restore <app...>`, `refresh [--cooldown s]`, `status`, and `reorder <app...> [--position n] [--no-restart] [--cooldown s]`.

Desktop CLI forms are `desktop list`, `desktop move <item> --x px --y px`, `desktop arrange [items...] [--by name|type|none] [--corner top-left|top-right|bottom-left|bottom-right] [--flow columns|rows]`, `desktop size <small|medium|large|xl|huge|px>`, `desktop options [--auto-arrange on|off] [--snap on|off] [--icons on|off]`, `desktop system <names...> --show|--hide`, `desktop apply <item> (--source ref [style] | --icon f.ico)`, `desktop restore <item...>`, `desktop save <file>`, and `desktop load <file>`. The engine commands print paths/text; Windows adapter commands print JSON. `src/cli.mjs` catches errors, writes a concise error, and returns a nonzero status.

### Raw PowerShell interface

`scripts/win/iconwright.ps1` accepts positional `Command` and parameters `-App`, `-Query`, `-Icon`, `-IconIndex`, `-NoRestart`, `-RestartCooldown`, `-Position`, `-Item`, `-X`, `-Y`, `-Value`, `-File`, `-By`, `-Corner`, `-Flow`, `-AutoArrange`, `-SnapToGrid`, and `-ShowIcons`. Taskbar commands: `apps`, `info`, `set-icon`, `pin`, `unpin`, `restore`, `refresh`, `status`, `reorder`. Desktop commands use the `desktop-` prefix: `desktop-list`, `desktop-move`, `desktop-arrange`, `desktop-size`, `desktop-options`, `desktop-system`, `desktop-set-icon`, `desktop-restore`, `desktop-save`, and `desktop-load`.

Success writes one compact JSON line to stdout via `Out-Json`; failures write a message to stderr and exit nonzero. `apps`, `info`, `status`, and restore operations return arrays where appropriate. The script uses `[Environment]::GetFolderPath` (`KF`) for LocalApplicationData, ApplicationData, and CommonApplicationData because MCP-launched processes may have trimmed environments with no `ProgramData` or `WINDIR`. All-users Start Menu shortcut edits require elevation and are reported in `skipped` rather than treated as successful.

### Codex and other MCP clients

Any MCP client can launch `node <path>/bin/iconwright-mcp.mjs` over stdio. Codex can register that command with `codex mcp add` or `~/.codex/config.toml` as shown in `README.md`. MCP itself requires Node and production dependencies; the launcher bootstraps those dependencies if `sharp` is absent. Windows paths are discovered from known folders, not assumed environment variables.

## 3. Capabilities and mechanisms

### Source, rendering, ICO, and preview

`loadSource` in `src/source.mjs` accepts Iconify IDs (`prefix:name`), raw SVG text beginning `<svg`, `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, and `.ico`. Iconify fetches use the Iconify API for SVG and search. ICO input is decoded from its largest directory entry by `largestIcoImage` in `src/ico.mjs`; PNG payloads are used directly, while 32-bit DIB payloads are converted to RGBA with bottom-up row handling.

`render.mjs` uses Sharp. SVG coloring rewrites fill/stroke attributes and inline declarations in `recolorSvg`; raster tint multiplies each RGB channel by the requested color while preserving alpha. It rotates and ensures alpha, trims transparent margins (`threshold: 1`), then scales the glyph into a 1024px master canvas. `padding` reserves a proportional border; optional square, rounded rectangle, or circle backplates are composited behind the glyph. Default padding is 8% without a shape and 20% with one. ICO output contains 256, 128, 64, 48, 32, 24, and 16px images. A 256px PNG is also emitted. Preview shows 48px and 24px icons on dark and light tiles. `makeSheet` lays out up to four columns with filename labels, decoding the largest ICO frame when needed.

`applyIcon` and `applyDesktopIcon` derive a six-character SHA-1 tag from the serialized source/style options and include it in the generated filename. Windows caches icon images by path, so a changed visual must use a new path for reliable cache invalidation. Icons live in `%LOCALAPPDATA%\iconwright\icons`; shortcuts reference those files, so deleting them breaks the customized icon.

### App icon changes and persistence

`Resolve-App` searches per-user and all-users Start Menu Programs shortcuts and returns AppID, target, explicit-ID status, and pinned matches. `Set-AppIcon` remembers each original `IconLocation` in `state.json`, writes the new location via `Iconwright.Lnk.SetIcon`, and calls `Iconwright.Refresh.Item` (`SHChangeNotify(SHCNE_UPDATEITEM)`). It also updates pinned `.lnk` files. For an explicit AppUserModelID, a running taskbar button gets its icon from the Start Menu shortcut and updates live. Pinned shortcuts that are not running are read at Explorer startup; if the app lacks an explicit ID, `needsRefresh` indicates a restart is needed. A pin operation's restart can satisfy that refresh. All-users shortcuts that cannot be written are returned as `skipped`.

### Pin, unpin, and order

`Iconwright.Taskband` in `Iconwright.Win.cs` reads/writes `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband`. `Favorites` is an ordered sequence of `{00, u32 cb, PIDL}` records terminated by `FF`; `FavoritesResolve` is an ordered sequence of `{u32 cb, serialized .lnk}` records. The two lists must remain aligned. New PIDLs reuse the `UserPinned` known-folder prefix and `TaskBar` item from an existing entry, then append the pinned file item. That item includes three extension blocks: `BEEF001E` with `02 00` plus UTF-16 `UserPinned\0`; `BEEF002B` with a FILETIME; and `BEEF001D` with `02 00` plus the AppID and null terminator. Each block is `cb:u16, version:u16=0, signature:u32, payload`, followed by a u16 offset to the first block. AppID comes from the shortcut's explicit ID or `Get-StartApps` mapping.

The shell's pin APIs do not provide a usable external write path: `IPinnedList3::Modify`/`LegacyModify` return success but are ignored outside `explorer.exe`; the Pin verb is Explorer-only and automation returns `E_INVALIDARG` or no-ops. `Taskband.Append`, `Remove`, `Sync`, and `SetOrder` edit the binary values while Explorer is stopped. `Cmd-Pin`, `Cmd-Unpin`, and `Cmd-Reorder` batch changes into one stop/write/start. Windows may auto-restart Explorer after `Stop-Process`; the script writes immediately to win the race. Pin order is the record order in both values.

### Explorer restart safety

`Invoke-WithExplorerStopped` in `iconwright.ps1` saves desktop view state, samples taskbar color, stops Explorer, performs the registry update, and starts Explorer. `-RestartCooldown` spaces restarts for batches. Restarting Explorer repeatedly can trigger TranslucentTB failsafe. `Iconwright.TaskbarColor.Sample` finds `Shell_TrayWnd` and samples 19 points along a row near the taskbar's top edge with `GetPixel` and takes the median color; `AccentPalette` provides stock-color references. Only a custom-to-stock color transition is reported as a styling failure; normal context changes such as a clear desktop taskbar are ignored. The script records styling processes and relaunches those that exited, including Store apps via `shell:AppsFolder` where needed.

### Desktop controls and per-item icons

`Iconwright.ExplorerShell.DesktopView` uses `ShellWindows.FindWindowSW(SWC_DESKTOP)` → `IShellBrowser` → `QueryActiveShellView`, with retry/backoff and a cached view reference. `Iconwright.Desktop.List` enumerates view items and obtains names from PIDLs; `Move` uses `GetItemPosition` and `SelectAndPositionItems(SVSI_POSITIONITEM)`. Explorer quantizes positions to grid spacing from `GetSpacing` even when snap-to-grid is off. `Invoke-DesktopArrange` sorts items by name/type or requested order, then places them from a selected corner in rows or columns using grid spacing and work area bounds.

`SetViewModeAndIconSize(FVM_ICON, px)` changes size. `SetCurrentFolderFlags` controls `FWF_AUTOARRANGE`, `FWF_SNAPTOGRID`, and `FWF_NOICONS`. Every desktop mutation calls `SaveViewState`; Explorer otherwise persists layout on clean exit, so the explicit save also protects changes before forced restarts. `desktop save/load` serializes icon size, arrange/snap options, item names, and positions to a user-selected JSON file.

`Set-DesktopIcon` selects an icon mechanism by item type: `.lnk` uses shortcut `IconLocation`; `.url` uses `IconFile`/`IconIndex`; folders use `desktop.ini` `IconResource` and set folder ReadOnly plus ini Hidden/System; system CLSIDs use per-user `DefaultIcon` registry keys and `SHChangeNotify(SHCNE_ASSOCCHANGED)`. Recycle Bin supports separate `empty` and `full` values. Plain files have no per-file icon mechanism in Explorer; use a shortcut or change the file type association. Visibility of This PC, Recycle Bin, User Files, Network, and Control Panel uses `HideDesktopIcons\NewStartPanel\{clsid}` (`1` hidden, `0` shown) then refreshes the desktop view. Label color is not configurable through this interface.

### State, restore, and backups

`state.json` contains an `originals` map keyed by shortcut path, with the original icon location (path and optional index). `Remember-Original` records it once; `Cmd-Restore` restores that icon, notifies Shell, synchronizes pinned entries, and removes the restored key. Desktop restore uses the same state store for item icon metadata where supported. `backups\` contains the Taskband registry export and pinned-folder copy that `Backup-Taskband` takes before the first Explorer-restarting change (pin/unpin/reorder/refresh) on the machine; later changes don't overwrite it. Desktop layout save/load is a separate explicit JSON snapshot, not the Taskband backup.

## 4. Data and Windows locations

| Location | Purpose |
|---|---|
| `%LOCALAPPDATA%\iconwright\icons\` | Generated `.ico`, previews, and PNG sizes referenced by shortcuts |
| `%LOCALAPPDATA%\iconwright\bin\` | Cached `Add-Type` interop assembly |
| `%LOCALAPPDATA%\iconwright\state.json` | Original shortcut/item icon metadata for restore |
| `%LOCALAPPDATA%\iconwright\backups\` | Pre-change Taskband export and pinned-folder copy |
| `%LOCALAPPDATA%\iconwright\last-explorer-restart` | Restart timestamp used by cooldown handling |
| `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband` | `Favorites` and `FavoritesResolve` pin records/order |
| `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel` | Per-user visibility flags for system desktop icons |
| `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\CLSID\{clsid}\DefaultIcon` | Per-user icon resource for system desktop items; Recycle Bin has `empty`/`full` values |

Known folders are resolved through .NET `Environment.GetFolderPath`, including the user pinned TaskBar folder and Start Menu locations. This is required for MCP processes launched with a trimmed environment.

## 5. Extending and porting

For a portable source or rendering feature, add the implementation to `source.mjs`, `render.mjs`, `ico.mjs`, or `sheet.mjs`, then expose it through the needed adapter: `cli.mjs` for engine commands, `cli-win.mjs` for Windows commands, and `mcp.mjs` for MCP tools. App-level orchestration belongs in `apply.mjs`; keep PowerShell argument mapping in `win.mjs`'s `buildWinArgs` aligned with the script parameter names.

For Windows behavior, add or change the operation in `scripts/win/iconwright.ps1` or `desktop.ps1`, define any Shell/Win32 COM interop in `Iconwright.Win.cs`, compile/cache it through `Import-Interop`, and add the corresponding Node adapter and MCP/CLI surface. Desktop view operations and Taskband formats are Windows-version-sensitive; preserve the verified behavior notes in `windows-taskbar.md` when changing them. Icon generation is portable subject to Node dependencies such as `sharp`; shortcut, Explorer, registry, taskbar, and desktop operations are Windows-only.
