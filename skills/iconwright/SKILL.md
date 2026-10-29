---
name: iconwright
description: Windows taskbar and desktop customization and icon design with the iconwright MCP tools. Use when the user wants app, taskbar or desktop icons changed or restyled, taskbar apps pinned, unpinned or reordered, desktop icons arranged, a custom icon designed or exported (.ico, .icns, favicon), or any of that undone.
---

# iconwright

iconwright's tools design icons on any OS and change the Windows taskbar and desktop. Work in **rounds**: each round is one small image the user looks at and answers. Changes to Windows are **batched**: one call covers every app.

## Designing an icon

Run the rounds in order; each ends when the user has picked.

1. **Find artwork.** `search_icons` for two or three phrasings of the idea. The sheet is numbered: picture N is `icons[N-1]`. Use `palette: "mono"` when the icon will be recolored, `simple-icons:<brand>` for brand logos. Done when the user names candidates, or you shortlist 3 to 6.
2. **Compare looks.** `design_icons` with the candidates as `sources` (rows A, B, …) and 3 or 4 style strings as `styles` (columns 1, 2, …). Done when the user picks a cell like "B2".
3. **Refine.** Change one thing per round (color, background, shape, padding) with another small grid. Before choosing colors or shapes, read [design-guide.md](design-guide.md) for what reads well at 16 to 24 px and on light and dark taskbars.
4. **Check in place.** `preview_icon` with the pick and the scenes that matter (Windows: `taskbar`, `start`, `sizes`; web: `browser`; Apple: `dock`, `ios`). Done when the user confirms, or after you've fixed what the scenes revealed (an icon vanishing on light or dark is the usual one).
5. **Deliver.** `make_icon` with the formats the user needs, or `app_apply_icon` to put it on Windows apps. Report the file paths or what changed, and how to undo it.

When the user wants to adjust by hand, `open_studio` with the current source and style; they paste back what the studio's "Copy for agent" button gives them.

**Style strings** carry every look: `color=white bg=#2d5ba6 shape=squircle shadow`. Keys: `color`, `bg` (CSS color or `linear-gradient(135deg,#a,#b)`), `shape` (`none` `square` `rounded` `squircle` `circle`), `radius` (0 to 0.5), `padding` (0 to 0.45), `shadow`. Quote them back to the user so they can reuse them.

**Sources**: Iconify ids, image files, raw `<svg>`, or `app:<App name>` for an installed Windows app's current icon.

## Changing Windows

- **Restyle many apps in one `app_apply_icon` call.** "Make my taskbar icons white": `taskbar_status` for the names, then one call with every name, `source: "app"`, `style: "color=white"`. Preview two or three of them first with `design_icons` (`app:<name>` sources) when the look is new to the user.
- **One `taskbar_pins` call per request.** It takes `pin`, `unpin` and `order` together and restarts Explorer once (the taskbar blinks; File Explorer windows close). Run it with `dryRun: true` first when the resulting order matters, and say a restart is coming.
- **Refresh once, at the end.** When a result carries a refresh `hint`, finish all other changes, then call `taskbar_refresh` once.
- **Exact names** come from `taskbar_status` or `find_apps`.
- **Desktop**: `desktop_layout` with `action: "save"` before `desktop_arrange`; `desktop_settings` takes several settings in one call.
- **Show the result** with `capture` after visible changes.

## Undo

| Undo | Call |
| --- | --- |
| Icons on some apps or desktop items | `restore_icons` with `apps` or `desktopItems` |
| Every icon iconwright changed | `restore_icons` with `all: true` |
| The latest pin change | `taskbar_restore_backup` |
| Every pin change | `taskbar_restore_backup` with `from: "original"` |
| A desktop arrangement | `desktop_layout` with `action: "load"` |

After any change, tell the user the matching undo in one sentence.

## When something fails

Call `doctor` and relay its finding in plain words. Errors from pin changes say whether the change was rolled back; when they say it wasn't, offer `taskbar_restore_backup`. The full risk list is at https://iconwright.guptajayam.com/docs/safety.md.
