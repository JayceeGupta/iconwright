# Commands

Every feature is available two ways: as an **MCP tool** (what agents use) and as a **CLI command** (`node bin/iconwright.mjs <command>`). Both return one line of JSON. Paths in results use forward slashes; you can pass them back as they are.

Tools that change your PC are marked as such for MCP clients. Ones that **restart Explorer** are marked ⟳ below.

## Make icons (any OS)

| MCP tool | CLI | What it does |
|---|---|---|
| `search_icons` | `search <words> [--limit n]` | Search Iconify's 200,000+ icons. Returns ids like `mdi:music`. |
| `make_icon` | `make --source <ref> [style]` | Make an `.ico` (256 to 16 px), a preview PNG and a PNG. Changes nothing on the PC. |
| `make_sheet` | `sheet <images...> --out file.png` | Put several images side by side with their names, to compare options. |

**Sources (`<ref>`):** an Iconify id (`simple-icons:spotify`, `mdi:music`), a `.svg`, `.png`, `.jpg`, `.webp` or `.ico` file, or raw `<svg>` text. For apps, `app` means the app's own icon.

**Style options:**

| Option | Meaning | Default |
|---|---|---|
| `color` | Recolor the artwork. Any CSS color: `white`, `#3b82f6`, `rgb(…)`, `hsl(…)` | original colors |
| `bg` | Background color behind the artwork | transparent |
| `shape` | `rounded`, `circle`, `square` or `none` | `rounded` when `bg` is set |
| `radius` | Corner radius for `rounded`, 0 to 0.5 | 0.22 |
| `padding` | Space around the artwork, 0 to 0.45 | 0.08, or 0.2 with a background |
| `name` | File name | the app name or `icon` |
| `outDir` (CLI `--out`) | Folder to write to | `%LOCALAPPDATA%\iconwright\icons` |
| `pngSize` (CLI `--png-size`) | Size of the extra PNG | 256 |

## Apps and taskbar (Windows)

| MCP tool | CLI | What it does |
|---|---|---|
| `list_apps` | `apps [text]` | Find apps by name. Returns exact names and AppIDs. |
| `app_info` | `info <app...>` | An app's ID, Start Menu shortcuts, pinned shortcuts, and whether it's a Store app. |
| `app_apply_icon` | `apply <app...> --source <ref\|app> [style] [--pin] [--refresh]` | Make an icon and put it on one or more apps. `source: "app"` restyles each app's own icon. |
| `app_set_icon` | `apply <app> --icon file.ico` or `set-icon <app> --icon file.ico` | Put an existing `.ico` (or an icon inside an `.exe`/`.dll`, with `index`) on an app. |
| `app_restore_icons` | `restore <app...>` | Put an app's original icon back. |
| `taskbar_status` | `status` | Pinned apps in order, with their icon files. |
| `taskbar_pin` ⟳ | `pin <app...> [--icon file.ico]` | Pin apps. |
| `taskbar_unpin` ⟳ | `unpin <app...>` | Unpin apps. |
| `taskbar_reorder` ⟳ | `reorder <app...> --position n` | Move pinned apps. 0 is first, -1 is last. |
| `taskbar_refresh` ⟳ | `refresh` | Restart Explorer so pinned icons reload. Only needed when a result says so. |
| `taskbar_restore_backup` ⟳ | `restore-pins [--from last\|original]` | Put the pinned apps back as they were before the last change, or before iconwright's first change. |

Commands marked ⟳ also take `noRestart` (`--no-restart`), which writes the change but waits for the next Explorer restart to show it, and `restartCooldown` (`--cooldown <seconds>`), which waits until at least that long after the previous restart.

Examples:

```bash
node bin/iconwright.mjs apply "Spotify" "Discord" --source app --color white
node bin/iconwright.mjs apply "Notepad" --source mdi:note-edit --color "#f59e0b" --bg "#1f2937" --shape rounded
node bin/iconwright.mjs pin "Notepad" "Calculator"
node bin/iconwright.mjs reorder "Notepad" --position 0
```

## Desktop (Windows; changes are live)

| MCP tool | CLI | What it does |
|---|---|---|
| `desktop_info` | `desktop list` | Icons and their positions, icon size, options, grid spacing, monitors, system icon visibility. |
| `desktop_move` | `desktop move <item> --x px --y px` | Move one icon. Snaps to the grid. |
| `desktop_arrange` | `desktop arrange [items...] [--by name\|type\|none] [--corner …] [--flow columns\|rows] [--monitor n]` | Line icons up from a corner of one monitor. Named items go first. |
| `desktop_icon_size` | `desktop size small\|medium\|large\|xl\|huge\|<16-256>` | Icon size. |
| `desktop_options` | `desktop options [--auto-arrange on\|off] [--snap on\|off] [--icons on\|off]` | Auto-arrange, align to grid, show or hide all icons. |
| `desktop_system_icons` | `desktop system <names...> --show\|--hide` | Show or hide `this-pc`, `recycle-bin`, `user-files`, `network`, `control-panel`. |
| `desktop_apply_icon` | `desktop apply <item> --source <ref> [style]` or `--icon file.ico` | Change the icon of a shortcut, internet shortcut, folder or system icon. |
| `desktop_restore_icons` | `desktop restore <item...>` | Put original icons back. |
| `desktop_layout_save` | `desktop save <file.json>` | Save positions, icon size and auto-arrange. |
| `desktop_layout_load` | `desktop load <file.json>` | Put icons back where a saved layout had them. |

## Undo and checks (Windows)

| MCP tool | CLI | What it does |
|---|---|---|
| `restore_all_icons` | `restore --all` | Put back every app and desktop icon iconwright changed. (Pins: `taskbar_restore_backup`.) |
| `doctor` | `doctor` | Read-only check: Windows and PowerShell versions, the pinned-apps list format, backups, taskbar mods. |
| `capture` | `capture [taskbar\|desktop\|screen] [--out file.png]` | Screenshot to check a change. `desktop` shows the icons even when windows cover them. Needs an unlocked screen. |

## Settings

| Environment variable | Effect |
|---|---|
| `ICONWRIGHT_RESTART_COOLDOWN` | Default `restartCooldown` in seconds. |
| `ICONWRIGHT_NO_WORKER=1` | The MCP server starts PowerShell for every call instead of keeping one running. Slower; useful for troubleshooting. |
| `ICONWRIGHT_ICONIFY_API` | Use a different Iconify API server. |
