# iconwright capabilities and ship readiness

iconwright makes multi-size Windows `.ico` files from Iconify IDs, SVG, PNG, JPEG, WebP, and ICO sources, then applies them to Start Menu shortcuts, taskbar pins, and desktop items. Its CLI and stdio MCP server share the same Node and PowerShell implementation. Desktop changes are live; some taskbar changes require Explorer to restart. Icon generation has automated Node tests, but the Windows shell operations have limited single-machine verification and use undocumented Taskband registry data.

## Capability inventory

### Icon creation

| Capability | What it does / CLI | MCP | Effect and limits |
|---|---|---|---|
| Search glyphs | `search <query> [--limit N]` queries Iconify. | `search_icons` | No system change. Needs network access to Iconify; results depend on that service. |
| Make an icon | `make --source <ref> [--name --color --bg --shape --radius --padding --out]` writes `.ico`, preview PNG, and 256 px PNG. Supported sources are Iconify IDs, local/raw SVG, PNG, JPEG, WebP, and ICO. `sheet <files...> --out <path>` makes a labeled contact sheet. | `make_icon`, `make_sheet` | No Explorer restart. ICO contains 256, 128, 64, 48, 32, 24, and 16 px images. Recoloring SVG targets fill/stroke; raster tint replaces visible RGB while preserving alpha, so it does not preserve multicolor raster artwork. Only a small set of named colors and hex/RGB syntax are accepted for raster tint. |

### App icons & taskbar

| Capability | What it does / CLI | MCP | Effect and limits |
|---|---|---|---|
| Find and inspect apps | `apps [query]`, `info <app...>` resolve Start Menu names/AppIDs, shortcuts, and pin state. | `list_apps`, `app_info` | Read-only. Uses Windows `Get-StartApps`; ambiguous names produce an error. |
| Apply icon | `apply <app> (--source <ref> [style] \| --icon <file.ico>) [--pin] [--refresh]`; `set-icon <app> --icon <file.ico> [--index n]` applies an existing icon. | `apply_icon`, `set_icon` | Running apps with explicit AppUserModelIDs update live through their Start Menu shortcut. Pinned items use their pinned shortcut; pinned closed items may need `refresh` to reload. Store app running-window icons remain package-controlled. All-users Start Menu shortcuts may be skipped without admin. App updates may recreate shortcuts. |
| Status and refresh | `status`; `refresh [--cooldown s]` reloads pinned shortcut icons. | `taskbar_status`, `refresh` | Status is read-only. Refresh restarts Explorer, disrupting the taskbar briefly. |

### Pinning

| Capability | What it does / CLI | MCP | Effect and limits |
|---|---|---|---|
| Pin apps | `pin <app...> [--icon <file.ico>] [--no-restart] [--cooldown s]`; `apply ... --pin` can combine icon application and pinning. | `pin_apps`, or `apply_icon` with `pin: true` | Pin list is written to the current user's Taskband registry data and Explorer restarts once per batch by default. Requires at least one existing taskbar pin to copy a PIDL prefix; otherwise it throws a clear error. Elevated/all-users cases are not verified. |
| Unpin apps | `unpin <app...> [--no-restart] [--cooldown s]` | `unpin_apps` | Explorer restarts once per batch by default. `--no-restart` defers the visible reload; use cautiously. |

### Taskbar order

| Capability | What it does / CLI | MCP | Effect and limits |
|---|---|---|---|
| Reorder pins | `reorder <app...> [--position n] [--no-restart] [--cooldown s]` moves the named apps together to an index; negative positions count from the end. | `reorder_taskbar` | Rewrites Taskband order and restarts Explorer by default. Order persistence after restart is verified on one machine. Uses undocumented Favorites/FavoritesResolve encoding. |

### Desktop icons

| Capability | What it does / CLI | MCP | Effect and limits |
|---|---|---|---|
| Inspect and arrange | `desktop list`; `desktop move <item> --x <px> --y <px>`; `desktop arrange [items...] --by name\|type\|none --corner top-left\|top-right\|bottom-left\|bottom-right` | `desktop_info`, `desktop_move`, `desktop_arrange` | Live, no Explorer restart. Positions snap to the icon grid, including when align-to-grid is off. `arrange` uses the active work area and grid spacing. |
| Size and options | `desktop size small\|medium\|large\|xl\|huge\|<px>`; `desktop options [--auto-arrange on\|off] [--snap on\|off] [--icons on\|off]` | `desktop_icon_size`, `desktop_options` | Live, no restart. Pixel size accepts 16–256. |
| System icons | `desktop system <names...> --show\|--hide` | `desktop_system_icons` | Visibility updates live. Supports This PC, Recycle Bin, user files, network, and Control Panel. |
| Set / restore icons | `desktop apply <item> (--source <ref> [style] \| --icon <file.ico>)`; `desktop restore <items...>` | `desktop_apply_icon`, `desktop_restore_icons` | Live, no Explorer restart. Supports shortcuts, internet shortcuts, folders, and listed system icons. Plain files cannot have individual icons; use a shortcut. Folder icons use `desktop.ini`. |
| Save / load layout | `desktop save <file>`; `desktop load <file>` | `desktop_layout_save`, `desktop_layout_load` | Load applies positions live and reports missing items. Layout records item positions, icon size, and auto-arrange; it does not save icon assignments, snap-to-grid, icon visibility, or system icon visibility. |

### State/undo

| Capability | What it does / CLI | MCP | Effect and limits |
|---|---|---|---|
| Restore app icons | `restore <app...>` restores original shortcut icon locations saved on first change. | `restore_icons` | Usually updates shortcuts live; pinned closed items may need Explorer restart. Restore is limited to shortcuts still found under the resolved app and saved state. |
| Restore desktop icons | `desktop restore <items...>` restores saved shortcut, URL, folder, or system icon values. | `desktop_restore_icons` | Changes apply live. Layout save/load is separate from icon undo. |
| Persistent files | Icons default to `%LOCALAPPDATA%\iconwright\icons\`; original app/desktop icon values are in `%LOCALAPPDATA%\iconwright\state.json`; Taskband backup files are in `%LOCALAPPDATA%\iconwright\backups\`. | N/A | Generated icon files are referenced by shortcuts and should not be deleted while in use. There is no cleanup or uninstall command. |

### Agent interfaces

| Interface | What it does | Commands / tools | Limits |
|---|---|---|---|
| CLI | JSON-oriented Node entry point: `node bin/iconwright.mjs <command>`. | Commands above; `help` prints usage. | Windows apply layer only runs on Windows. Generation can run cross-platform; this is not a macOS/Linux apply layer. |
| MCP | Stdio server at `node bin/iconwright-mcp.mjs`; clients can call the tools above. | Tool names are listed in `test/mcp.test.mjs`; includes generation, app/taskbar, and desktop tools. | First launcher start installs production dependencies if `node_modules/sharp` is missing. Codex registration and fresh Claude plugin install have not been tested. |
| Claude skill | `skills/iconwright/SKILL.md` guides app discovery, icon choice, preview, apply, and undo. | Prefer MCP tools; fall back to `node <plugin-root>/bin/iconwright.mjs`. | Describes intended agent workflow, not a separate implementation. It documents only a subset of CLI operations; consult `help` for the full current command list. |

## Verified vs. unverified

The findings below reflect developer testing on 2026-10-26/27 on one Windows 11 build 26200 machine with StartAllBack 3.9 taskbar replacement, TranslucentTB, 200% display scaling, and one monitor. They are not broad compatibility claims.

**Verified visually:** pinning T3 Code (Electron app with explicit AppUserModelID) and Character Map (classic Win32 without explicit ID); pins appear while closed and merge with running windows; T3 Code icon changes live through CLI and MCP; Apple Music (Store app) pinned icon recoloring; unpin; batch pinning two apps in one Explorer restart; TranslucentTB failsafe detection after false-positive fixes.

**Verified by API readback only, with screen locked:** desktop list, move, arrange, size, options, system icon show/hide, set-icon, restore, save, and load; taskbar reorder, with order persisting after Explorer restart. These checks do not establish what a user sees on screen.

**Not tested:** stock Windows 11 taskbar without StartAllBack; Windows 10; multi-monitor; non-English Windows; zero existing taskbar pins (the code throws a clear error); elevated runs and all-users Start Menu shortcuts; Store app running-window icon; fresh Claude Code plugin install via `/plugin marketplace add`; Codex MCP registration; macOS/Linux apply layers (engine only).

## Public ship readiness

| Area | Rating | Reason |
|---|---|---|
| Icon generation | **Beta** | Useful formats, preview, seven ICO sizes, and Node tests exist; source/color edge cases and Windows packaging still need wider checks. |
| Desktop management | **Experimental** | Broad live controls are implemented and readback-tested, but visual behavior has not been verified and only one machine/configuration is covered. |
| App icon changes | **Beta** | Live explicit-ID behavior and Store pinned icon behavior were visually confirmed; app discovery, permissions, and app-specific behavior vary. |
| Pin, unpin, reorder | **Experimental** | Working visually in the tested setup, but relies on undocumented Taskband bytes and Explorer lifecycle behavior. |
| CLI / MCP / installation | **Beta** | Both interfaces exist and MCP tool coverage has a test; real installs and client registration have not been exercised. |
| Public release process | **Not ready** | `package.json` is private and version `0.1.0`; no release automation, support policy, or uninstall/cleanup path is present. |

### Top risks

- Taskband `Favorites` PIDLs, extension blocks, and `FavoritesResolve` are undocumented Windows formats. An OS update can invalidate pinning or reorder logic. See `docs/windows-taskbar.md` and `scripts/win/Iconwright.Win.cs`.
- Pin, unpin, reorder, and refresh forcibly restart Explorer. This blinks/reloads the shell and can affect taskbar styling tools; the failsafe is heuristic and styling recovery can fail. See `scripts/win/iconwright.ps1`.
- The Windows layer depends on PowerShell 5.1 and compiles C# with `Add-Type` on first use. The machine/configuration compatibility surface is largely untested.
- One-machine testing is not enough for supported Windows builds, taskbar replacements, scaling, language, multi-monitor, or privilege combinations.
- No CI, git repository, published package/release, uninstall command, or generated-file cleanup workflow is present. Antivirus may flag registry edits plus Explorer restarts.

### Code review notes

All three were fixed on 2026-10-27:
- ~~`desktop.ps1` swallowed `SaveViewState` failures~~. `Save-Desktop` now prints a warning to stderr; the live change still stands.
- ~~`render.mjs` interpolated `--bg` into SVG unchecked~~. `safeColor` now accepts only hex, `rgb[a]()`, `hsl[a]()` and named colors, for both `--bg` and `--color`.
- ~~CLI `apply` silently ignored extra app names~~. It now requires exactly one app.
- Also fixed after review: Taskband backups are now taken automatically (`Backup-Taskband`) before the first Explorer-restarting change, instead of relying on a manual export.

### Before public release

1. Add CI for Node tests and Windows smoke tests; verify install, MCP startup, permissions, and supported Windows/taskbar combinations on clean machines.
2. Add strict validation and failure reporting for desktop persistence and icon style inputs; review Taskband writes and rollback behavior against backups.
3. Document supported Windows versions, admin requirements, Explorer restart effects, backups, recovery, and known compatibility limits.
4. Create versioned releases and a tested install/uninstall flow, including safe handling of generated icons, state, and backups.
5. Run visual tests on stock Windows 11, Windows 10 if supported, multiple monitors/scales, non-English Windows, elevated installs, and systems with no existing pin; test Store app running-window behavior.
6. Verify fresh Claude Code marketplace installation and Codex MCP registration, then publish release notes and a support/contribution path.

## Difference from the original plan

`docs/DESIGN.md` described manual pinning as the v1 path and scripted auto-pin as a stub. The current implementation adds automated Taskband pin/unpin/reorder, desktop management, persisted original icon state, and an MCP server. Conversely, the planned manifest, named themes, bulk retheme, batch spec, and effects (stroke/map/gradient/shadow) are not in the current CLI. The current style surface is color, background, shape, radius, and padding; the Windows apply layer remains Windows-only.
