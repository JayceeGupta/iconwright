# For agents

This page is for AI agents that use iconwright, and for people setting one up. It covers the setup prompt, how to drive the tools well, and where to find machine-readable docs.

## Setup prompt

Paste this to any agent with a terminal (Claude Code, Codex, Cursor and others):

```text
Set up iconwright for me (https://iconwright.guptajayam.com). It's an MCP server
for designing icons and customizing the Windows taskbar and desktop.

1. If you are Claude Code, run:
     /plugin marketplace add JayceeGupta/iconwright
     /plugin install iconwright@icon-playground
   Otherwise: git clone https://github.com/JayceeGupta/iconwright, run npm install
   in it, and add a stdio MCP server named "iconwright" that runs:
     node <clone>/bin/iconwright-mcp.mjs
2. Read https://iconwright.guptajayam.com/llms.txt to learn how to use it well.
3. On Windows, call the doctor tool. Then tell me what you can do.
```

## Docs for machines

- [`/llms.txt`](/llms.txt): a short index of the docs with the key usage rules.
- [`/llms-full.txt`](/llms-full.txt): every docs page in one file.
- Every docs page is also plain Markdown: add `.md` to its address, for example [`/docs/tools.md`](/docs/tools.md).
- The [MCP tool reference](tools.md) is generated from the server's own tool definitions, so it's always current.

In Claude Code, the plugin also installs a skill with these guidelines, so you don't need to fetch anything.

## How to use iconwright well

### Design in rounds of small images

Each design tool returns one small image. Show it to the user and let them choose, then change one thing per round.

1. `search_icons` returns a numbered contact sheet; picture N is `icons[N-1]`. Search two or three phrasings for range.
2. `design_icons` puts sources in rows (A, B, …) and styles in columns (1, 2, …). The user answers with a cell like “B2”.
3. `preview_icon` shows the pick on real surfaces. Do this before applying anything; it catches icons that vanish on a light or dark taskbar.
4. `make_icon` writes files; `app_apply_icon` puts the icon on Windows apps.

When the user wants to fiddle by hand, call `open_studio` with the current source and style. The studio's “Copy for agent” button gives them text to paste back to you.

### Styles are strings

Every styling argument is one string of `key=value` pairs:

```text
color=white bg=#2d5ba6 shape=squircle shadow
color=#25282d padding=0.12
color=white bg=linear-gradient(135deg,#e9c46a,#c47335) shape=rounded radius=0.3
```

Keys: `color`, `bg`, `shape` (`none`, `square`, `rounded`, `squircle`, `circle`), `radius` (0 to 0.5), `padding` (0 to 0.45), `shadow`. A typo is an error that names the valid keys.

### Sources

- An Iconify id: `mdi:music`, `ph:rocket-launch-fill`. Brand logos: `simple-icons:<brand>`.
- A file: `.svg`, `.png`, `.jpg`, `.webp` or `.ico`.
- Raw SVG text.
- `app:<App name>`: an installed Windows app's current icon. Useful for restyling an app's own artwork.

### Windows: batch, don't loop

- Restyle many apps in **one** `app_apply_icon` call. Source `"app"` restyles each app's own icon: `apps: [all pinned names], source: "app", style: "color=white"`.
- `taskbar_pins` takes `pin`, `unpin` and `order` together and restarts Explorer **once**. Every separate call is another restart, which closes File Explorer windows and can upset taskbar styling tools. Use `dryRun: true` to check the resulting order first.
- If a result includes a `hint` about refreshing, call `taskbar_refresh` once at the end, not after each change.
- Get exact app names from `taskbar_status` or `find_apps`.

### Undo

| To undo | Call |
| --- | --- |
| Icons on some apps or desktop items | `restore_icons` with `apps` or `desktopItems` |
| Every icon iconwright changed | `restore_icons` with `all: true` |
| The latest pin change | `taskbar_restore_backup` (default `"last"`) |
| All pin changes ever | `taskbar_restore_backup` with `from: "original"` |
| Desktop arrangement | `desktop_layout` with `action: "load"` (save one first) |

Tell the user how to undo after any visible change.

### Checking your work

- `capture` takes a screenshot of the taskbar, the desktop icons or the screen. Use it after visible changes.
- `doctor` explains why something failed: Windows version, pin-list format, backups, taskbar mods.

## Prompts

The server offers four prompts. Clients that support MCP prompts show them as commands; in Claude Code they're in the `/` menu, marked (MCP):

| Prompt | What it does |
| --- | --- |
| `design-icon` | Designs an icon from an idea: search, compare, preview, export or apply. |
| `restyle-taskbar` | Gives every pinned app one look, with a preview before applying. |
| `tidy-desktop` | Backs up the desktop layout, then arranges icons. |
| `undo-everything` | Restores every icon and, if wanted, the original pinned apps. |

## Cost

The full tool list is about 4,500 tokens. Typical image results are small: a 24-icon search sheet is about 150 image tokens, a 3 × 4 design grid about 200, and a four-scene preview about 700. Text results are compact JSON with forward-slash paths and no empty fields.
