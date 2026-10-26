---
name: iconwright
description: Use when the user wants to make, restyle, or change app icons, or customize the Windows taskbar — "change the X taskbar icon", "make me a red Spotify icon", "pin X to the taskbar", "make all my taskbar icons white", "restore the original icon", "move Spotify to the front of the taskbar", "make my desktop icons smaller", "arrange my desktop icons on the right", "change the Recycle Bin icon".
---

# iconwright

Makes `.ico` icons (Iconify glyphs, SVG/PNG/ICO files) and applies them to Windows apps: taskbar, pinned items, Start Menu. Pins, unpins and reorders taskbar apps. Arranges, resizes and re-icons desktop icons.

## Interface

Prefer the `iconwright` MCP tools (`apply_icon`, `make_icon`, `pin_apps`, …). If they aren't available, use the CLI. It prints one JSON line per call:

```
node <plugin-root>/bin/iconwright.mjs <command> ...      # plugin-root = ../.. from this file
```

| Goal | CLI |
|---|---|
| Find the app's exact name | `apps <text>` |
| Inspect shortcuts / pin state | `info <app>` |
| Find a glyph | `search <query> --limit 10` |
| Make an icon only | `make --source <ref> [style]` |
| Make + apply in one step | `apply <app> --source <ref> [style] [--pin]` |
| Apply an existing .ico | `apply <app> --icon file.ico` |
| Pin / unpin (several at once) | `pin <app> <app2>` / `unpin <app>` |
| Undo icon changes | `restore <app>` |
| Reload pinned icons (after `hint`) | `refresh` |
| Reorder taskbar | `reorder <app...> --position n` |
| Desktop: inspect | `desktop list` |
| Desktop: icon size | `desktop size small|medium|large|<px>` |
| Desktop: layout | `desktop arrange [items...] --by name --corner top-right`, `desktop move <item> --x --y`, `desktop save/load <file>` |
| Desktop: re-icon | `desktop apply <item> --source <ref> [style]` (shortcuts, folders, This PC, Recycle Bin…) |
| Desktop: system icons | `desktop system recycle-bin this-pc --show` |
| What's pinned, with which icon | `status` |

Sources (`<ref>`): Iconify id (`mdi:spotify`, `simple-icons:discord`, `lucide:terminal`), a `.svg`/`.png`/`.ico` path (an existing `.ico` can be recolored), or raw `<svg…>`.
Style: `--color <c>` recolors the glyph; `--bg <c>` + `--shape rounded|circle|square` adds a backplate; `--padding 0..0.4`; `--radius`. Default is a transparent background. Keep it transparent unless the user asks for a backplate.

## Workflow

1. Resolve the app: `apps <text>`. If several match, pick the obvious one or ask.
2. Choose a source. For brand logos try `simple-icons:<brand>` first; otherwise `search`.
3. Unsure about the look? `make` it first and view the `preview` PNG it returns (48 px and 24 px on dark and light tiles) before applying. For several options, `make` each and compare them with `sheet`.
4. `apply`. Add `--pin` only if the user wants it on the taskbar and `info` shows it isn't pinned.
5. Report in one line what changed. Mention `restore <app>` as the undo.

## Things to know

- Running apps take their taskbar icon from the Start Menu shortcut that has the app's AppUserModelID. `apply` updates that shortcut and the pinned one, and the change shows up live.
- Some apps (no AppUserModelID, e.g. classic Win32 tools) only show a new pinned icon after an Explorer restart. `apply` then returns a `hint`: do all your changes first, then run `refresh` once.
- **Pinning and unpinning restart Windows Explorer** (the taskbar blinks). Batch apps into one `pin`/`unpin` call. Don't pin or unpin repeatedly in a loop. The result's `explorer` field reports if the taskbar's look changed (e.g. TranslucentTB). If `hint` is set, tell the user. `--cooldown <sec>` spaces out restarts for long batches.
- `skipped` in `set-icon`/`apply` output means the shortcut needs admin (all-users Start Menu). Tell the user, don't retry.
- App updates can recreate shortcuts and revert the icon. Re-run `apply`.
- Store (UWP) apps: pinned icon changes; the running-window icon may stay the package's.
- Desktop changes apply live. Positions snap to the icon grid. Before rearranging someone's desktop, `desktop save` a backup layout. Plain files (e.g. a .txt) can't get their own icon; use a shortcut.
- `reorder` also restarts Explorer; combine it with pin changes where possible.
- Icons are saved to `%LOCALAPPDATA%\iconwright\icons\`. Shortcuts point there, so don't delete them.
