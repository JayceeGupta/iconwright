# Changelog

## Unreleased

- **Fix:** restyling an app no longer changes pinned shortcuts that only launch through it with arguments, such as Steam games (which run `steam.exe steam://rungameid/…`) or browser profile shortcuts. Found on screen: restyling Steam also changed a pinned Steam game.
- `iconwright report` prints system details and a self-test as Markdown for test reports, without app names, paths or the user name.
- `iconwright mcp` starts the MCP server, and the package is ready for npx as `iconwright-mcp` (not published yet).
- Screenshots explain a locked or sleeping screen instead of failing with "The handle is invalid".
- Docs: test prompts for macOS, Linux and Windows with the stock taskbar; issue and pull request templates; what doesn't work while the screen is locked.

## 0.2.0 (2026-10-29)

A design release: iterate on icons cheaply, with your agent or by hand, and see them in place before using them.

**Design**

- `design_icons`: compare artwork (rows) and styles (columns) in one small grid; pick a cell like "B2".
- `search_icons` returns a numbered contact sheet, icon licenses, paging, set filters and a `palette` filter (single-color or multicolor sets).
- `preview_icon`: mockups on a Windows taskbar, Start menu, desktop and File Explorer, a browser tab, the macOS Dock, iOS and Android, plus true pixel sizes. On Windows, your own pinned apps sit around the icon.
- Styles are one string everywhere: `color=white bg=#2d5ba6 shape=squircle shadow`. New: gradient backgrounds, the squircle shape and a soft shadow.
- `app:<App name>` uses an installed app's current icon as a source (Windows).
- Export to macOS `.icns`, a favicon and web-app set (with a maskable icon and manifest) and PNG sets. `.ico` files now include 20 and 40 px images for 125% and 250% scaling.
- The studio: a visual editor in the browser, online or local (`iconwright studio`, or the `open_studio` tool). Local studio can apply icons to apps.

**Windows**

- `taskbar_pins`: pin, unpin and reorder in one call and one Explorer restart, with a dry run.
- Changes from agents and the studio run one at a time, start to finish.

**For agents**

- 20 tools instead of 27, with a 25% smaller tool list. Tool definitions live in one table that also generates the docs.
- MCP prompts: design-icon, restyle-taskbar, tidy-desktop, undo-everything.
- A rewritten skill with a design guide, `llms.txt`, `llms-full.txt`, and every docs page as Markdown.

**Renamed or merged tools**: `list_apps` and `app_info` → `find_apps`; `app_set_icon` → `app_apply_icon` with `icon`; `taskbar_pin`, `taskbar_unpin` and `taskbar_reorder` → `taskbar_pins`; `app_restore_icons`, `desktop_restore_icons` and `restore_all_icons` → `restore_icons`; `desktop_icon_size`, `desktop_options` and `desktop_system_icons` → `desktop_settings`; `desktop_layout_save` and `desktop_layout_load` → `desktop_layout`; `desktop_move` takes a list; `make_sheet` → `design_icons`. Style options are now one `style` string.

**Fixes**: recoloring leaves SVG masks and clip paths alone and recolors gradient fills; artwork with an opaque background keeps it; gradients span the whole icon at any angle, as in CSS; edited source files are never served from a stale cache.

## 0.1.0 (2026-10-27)

First public version.

- Make `.ico` icons (256 to 16 px) from Iconify names, SVG, PNG, JPEG, WebP or existing `.ico` files, with recolor, backplate, padding and preview images. Works on Windows, macOS and Linux.
- Windows: change app icons on the taskbar, Start Menu and pinned shortcuts; pin, unpin and reorder taskbar apps; move, arrange, resize, re-icon, show and hide desktop icons; save and load desktop layouts.
- Undo: `restore <app>`, `restore --all`, `desktop restore`, and `restore-pins` (pin list backups taken before every change).
- Safety: pin-list writes refuse unfamiliar layouts, roll back on failure, and run one at a time. `doctor` checks a PC before use.
- Interfaces: CLI, MCP server (stdio), Claude Code plugin with a skill, and Codex via MCP.
