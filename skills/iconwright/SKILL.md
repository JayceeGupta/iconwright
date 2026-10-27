---
name: iconwright
description: Use when the user wants to make, restyle or change icons, or customize the Windows taskbar or desktop. Examples - "change the Spotify taskbar icon", "make me a red Discord icon", "make all my taskbar icons white", "pin VS Code", "move Spotify to the front of the taskbar", "make my desktop icons smaller", "put my desktop icons on the right", "change the Recycle Bin icon", "undo my icon changes".
---

# iconwright

Makes `.ico` icons (any OS) and changes Windows: app icons on the taskbar and Start Menu, pinned apps and their order, and desktop icons. Every change can be undone.

## Tools

Use the `iconwright` MCP tools. Without them, run the CLI: `node <plugin-root>/bin/iconwright.mjs <command>` (plugin root = two folders up from this file; `help` lists commands; each prints one line of JSON).

| Goal | Tool | CLI |
|---|---|---|
| Find an app's exact name | `list_apps` | `apps <text>` |
| An app's shortcuts and pin state | `app_info` | `info <app>` |
| What's pinned, with which icon | `taskbar_status` | `status` |
| Find artwork | `search_icons` | `search <words>` |
| Make an icon and look at it | `make_icon` | `make --source <ref> [style]` |
| Compare several options | `make_sheet` | `sheet <files> --out f.png` |
| Restyle one or many apps | `app_apply_icon` | `apply <app...> --source <ref\|app> [style]` |
| Put an existing .ico on an app | `app_set_icon` | `apply <app> --icon f.ico` |
| Pin, unpin, reorder | `taskbar_pin`, `taskbar_unpin`, `taskbar_reorder` | `pin`, `unpin`, `reorder <app...> --position n` |
| Desktop | `desktop_info`, `desktop_arrange`, `desktop_move`, `desktop_icon_size`, `desktop_options`, `desktop_system_icons`, `desktop_apply_icon`, `desktop_layout_save`/`_load` | `desktop list\|arrange\|move\|size\|options\|system\|apply\|save\|load` |
| Undo | `app_restore_icons`, `desktop_restore_icons`, `restore_all_icons`, `taskbar_restore_backup` | `restore <app>`, `desktop restore`, `restore --all`, `restore-pins` |
| Check the result | `capture` | `capture taskbar\|desktop` |
| Something fails | `doctor` | `doctor` |

**Sources:** an Iconify id (`simple-icons:spotify`, `mdi:music`, `lucide:terminal`), a `.svg/.png/.jpg/.webp/.ico` file, raw `<svg>`, or (for apps) `app` = the app's own icon.
**Style:** `color` recolors the artwork; `bg` + `shape` (`rounded`, `circle`, `square`) adds a background; `padding`, `radius`. Keep the background transparent unless the user asks for one.

## Workflow

1. Resolve names with `list_apps` (or `taskbar_status` for pinned apps). If several apps match, pick the obvious one or ask.
2. Pick a source. Brand logos: try `simple-icons:<brand>` first, otherwise `search_icons`. To restyle what's already there (e.g. "make my icons white"), use source `app`.
3. Not sure about the look? `make_icon` first and show the preview. For several options, make each and compare with `make_sheet`.
4. Apply. Many apps at once: one `app_apply_icon` call with all of them.
5. Check with `capture` when the result should be visible. Report what changed in a line or two, and say how to undo it.

## Rules

- **Pin, unpin, reorder, refresh and restore-backup restart Windows Explorer.** The taskbar blinks and open File Explorer windows close. Put all apps in one call. Never call these in a loop. Tell the user before doing several.
- If a result has a `hint` about refresh, finish all other changes, then call `taskbar_refresh` once.
- If the result's `explorer.hint` says the taskbar look changed, a styling tool (TranslucentTB) may have switched off. Tell the user. For long batches pass `restartCooldown` (seconds).
- `skipped` shortcuts are shared by all users and need admin. Mention it; don't retry.
- Before rearranging a desktop, `desktop_layout_save` a backup. Plain files (like a .txt) can't get their own icon; use a shortcut.
- App updates can recreate shortcuts and undo a custom icon; apply again.
- Store apps: the pinned icon changes; the running window may keep the app's own icon.
- Icons live in `%LOCALAPPDATA%\iconwright\icons`. Shortcuts point there; don't delete them.
