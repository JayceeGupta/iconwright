# Command line

Everything the agent tools do is also available as a command. With Node.js 20 or newer, run it from anywhere:

```bash
npx -y iconwright <command> [options]
```

`npx iconwright help` lists the commands, and `<command> --help` shows one command's options. Unknown options are errors, so a typo never runs silently.

**Sources** are an Iconify id (`mdi:music`), an image file (`.svg`, `.png`, `.jpg`, `.webp`, `.ico`), raw `<svg>` text, or (on Windows) `app:<App name>` for an installed app's current icon.

**Styles** are given as one string, `--style "color=white bg=#2d5ba6 shape=squircle shadow"`, or as separate flags: `--color`, `--bg`, `--shape`, `--radius`, `--padding`, `--shadow`. Separate flags win over the same key in `--style`. See [style strings](design.md#styles).

## Design (any OS)

| Command | What it does |
| --- | --- |
| `search <query>` | Prints matching Iconify ids. `--limit N`, `--start N` (next page), `--collections mdi,ph`, `--palette mono\|color`, `--sheet out.png` (also saves a numbered contact sheet). |
| `design <source...> --out grid.png` | Renders a comparison grid: sources in rows, styles in columns. `--styles "style one\|style two"`. Prints the legend. |
| `preview <source> --out scenes.png` | Mocks the icon up on real surfaces. `--style`, `--label "App name"`, `--scenes taskbar,start,desktop,explorer,browser,dock,ios,android,sizes`, `--scale 1\|1.5\|2`. |
| `make <source>` | Writes icon files. `--formats ico,png,icns,web,pngset` (default `ico,png`), `--name`, `--out folder`, `--png-size N`, plus style options. |
| `studio [source]` | Opens the [studio](studio.md) in your browser. `--style`, `--port N`, `--no-open`. Runs until you press Ctrl+C. |
| `sheet <images...> --out sheet.png` | Puts image files (PNG or ICO) side by side with their names. |

Examples:

```bash
npx iconwright search rocket --palette mono --sheet rockets.png
npx iconwright design ph:rocket-launch-fill tabler:rocket --styles "color=white bg=#2d5ba6 shape=squircle|color=#e9c46a bg=#1f2228 shape=circle" --out grid.png
npx iconwright preview ph:rocket-launch-fill --style "color=white bg=#2d5ba6 shape=squircle" --label Launcher --out scenes.png
npx iconwright make ph:rocket-launch-fill --style "color=white bg=#2d5ba6 shape=squircle" --formats ico,icns,web --name launcher
```

## Apps and taskbar (Windows)

| Command | What it does |
| --- | --- |
| `apps [text]` | Finds installed apps by name. Prints exact names and AppIDs. |
| `info <app...>` | Shows an app's AppID, Start menu shortcuts, pinned shortcuts and whether it's a Store app. |
| `apply <app...> --source <ref>` | Makes an icon and puts it on the apps. `--source app` restyles each app's own icon. `--pin` also pins them; `--refresh` restarts Explorer at the end if needed. Or `apply <app> --icon file.ico` to use an existing icon. |
| `status` | Lists pinned apps in order with their icon files. |
| `pins` | Pins, unpins and reorders in one Explorer restart: `--pin a,b`, `--unpin c`, `--order a,b`, `--position N` (0 = first, -1 = last), `--dry-run`, `--no-restart`, `--restart-cooldown N`. |
| `refresh` | Restarts Explorer so pinned icons reload. |
| `restore <app...>` | Puts the original icons back. `restore --all` restores every app and desktop icon iconwright changed. |
| `restore-pins` | Puts the pinned-apps list back. `--from last` (default) or `--from original`. |

`pin`, `unpin` and `reorder` still work as shortcuts for `pins`.

```bash
npx iconwright apply Spotify Steam Discord --source app --style "color=white"
npx iconwright pins --pin Notepad --order Notepad --position 0 --dry-run
npx iconwright restore --all
```

## Desktop (Windows)

| Command | What it does |
| --- | --- |
| `desktop list` | Icons with positions, icon size, options, grid spacing and monitors. |
| `desktop move <item> --x px --y px` | Moves one icon (snaps to the grid). |
| `desktop arrange [items first...]` | Lines icons up. `--by name\|type\|none`, `--corner top-left\|top-right\|bottom-left\|bottom-right`, `--flow columns\|rows`, `--monitor N`. |
| `desktop size <size>` | `small`, `medium`, `large`, `xl`, `huge`, or pixels from 16 to 256. |
| `desktop options` | `--auto-arrange on\|off`, `--snap on\|off`, `--icons on\|off`. |
| `desktop system <names...> --show\|--hide` | `this-pc`, `recycle-bin`, `user-files`, `network`, `control-panel`. |
| `desktop apply <item>` | Changes a desktop item's icon: `--source <ref>` plus style options, or `--icon file.ico`. |
| `desktop restore <item...>` | Puts original icons back. |
| `desktop save <file.json>` / `desktop load <file.json>` | Saves or restores icon positions, size and auto-arrange. |

## Checks (Windows)

| Command | What it does |
| --- | --- |
| `doctor` | Checks that the taskbar and desktop tools can work on this PC. Changes nothing. |
| `capture [taskbar\|desktop\|screen]` | Saves a screenshot. `--out file.png`, `--max-width px`. Doesn't work while the screen is locked. |

## Testing (any OS)

| Command | What it does |
| --- | --- |
| `report` | Prints your system details and a quick self-test as Markdown, for [test reports](contributing.md). Names no apps, files or user folders. `--out report.md` saves it. |
| `mcp` | Starts the MCP server on stdio (the same as `bin/iconwright-mcp.mjs`). |

## Output and exit codes

Commands print plain text or compact JSON. Windows paths use forward slashes, and every command accepts them back. On failure, a command prints a one-line error and exits with code 1.
