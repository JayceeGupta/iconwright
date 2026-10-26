<p align="center"><img src=".claude-plugin/icon.png" width="96" alt="iconwright logo"></p>

# iconwright

**Ask your AI agent to restyle Windows.** iconwright lets Claude Code, Codex or any MCP client make icons and change how your taskbar and desktop look:

> "Make the Spotify taskbar icon white."
> "Pin T3 Code and move it next to VS Code."
> "Put my desktop icons in the top-right corner and make them smaller."
> "Undo all of that."

It works as a **Claude Code plugin**, an **MCP server** (for Codex and other agents) and a plain **command-line tool**.

> **Status: early release (0.1).** Everything below works on the developer's PC (Windows 11). It hasn't been tested on many other setups yet, and pinning relies on an undocumented Windows format. Read [Safety and risks](docs/safety.md) before you use it on a machine you care about.

## What it can do

| | |
|---|---|
| **Make icons** (any OS) | Turn an [Iconify](https://icon-sets.iconify.design) icon name, SVG, PNG, JPEG, WebP or existing `.ico` into a proper Windows `.ico` (16 to 256 px). Recolor it, add a rounded or circle background, preview it on dark and light. |
| **App icons** (Windows) | Change an app's icon on the taskbar, Start Menu and pinned shortcut. Running apps usually update instantly. |
| **Taskbar** (Windows) | Pin, unpin and reorder apps. |
| **Desktop** (Windows) | Move, arrange, resize, hide and re-icon desktop icons. Show or hide This PC, Recycle Bin and the other system icons. Save and load layouts. |
| **Undo** (Windows) | Put back one app's icon, every icon at once, or the whole pinned-apps list from automatic backups. |
| **Check** (Windows) | `doctor` checks your PC before you start. `capture` takes a screenshot of the taskbar or desktop so the agent can see what it changed. |

**Mac and Linux:** only icon making works there. The taskbar and desktop features use Windows-only parts of the system, so they're not available (the commands say so instead of failing strangely).

## Install

You need **Windows 10 or 11** and **[Node.js](https://nodejs.org) 20 or newer**. The first run downloads the image library it needs (about 10 seconds).

### Claude Code

```text
/plugin marketplace add JayceeGupta/iconwright
/plugin install iconwright@icon-playground
```

Then just ask, for example: *"make my Discord taskbar icon purple"*.

### Codex

```bash
git clone https://github.com/JayceeGupta/iconwright
codex mcp add iconwright -- node /path/to/iconwright/bin/iconwright-mcp.mjs
```

Codex asks before each tool call. To let it run the read-only tools without asking, see [Getting started](docs/getting-started.md#codex).

### Any other MCP client

Run `node /path/to/iconwright/bin/iconwright-mcp.mjs` as a stdio MCP server.

### Command line

```bash
git clone https://github.com/JayceeGupta/iconwright
cd iconwright
node bin/iconwright.mjs help
node bin/iconwright.mjs doctor
node bin/iconwright.mjs apply "Spotify" --source simple-icons:spotify --color white
```

## Before you start

- **Pinning, unpinning and reordering restart Windows Explorer.** The taskbar disappears for a second or two. Open File Explorer windows close. Your apps keep running.
- **Taskbar styling tools** (TranslucentTB, etc.) can switch themselves off if Explorer restarts twice in quick succession. iconwright notices and restarts them, and `--cooldown` spaces restarts out.
- **Everything can be undone.** Original icons are remembered, and the pinned-apps list is backed up before every change. See [Safety and risks](docs/safety.md).

## Docs

- [Getting started](docs/getting-started.md): install, first changes, checking and undoing them
- [Commands](docs/commands.md): every CLI command and MCP tool
- [Safety and risks](docs/safety.md): what iconwright changes, backups, recovery and known risks
- [Compatibility](docs/compatibility.md): what's been tested and where
- [How it works](docs/how-it-works.md): the techniques behind each feature
- [Windows internals](docs/windows-internals.md): low-level notes for contributors

## Contributing

Bug reports are very welcome, especially from setups the developer hasn't tested (Windows 10, the stock Windows 11 taskbar, several monitors, other languages). Please include the output of `node bin/iconwright.mjs doctor`.

Run the tests with `npm test`.

## License

[MIT](LICENSE)
