<p align="center"><img src="assets/brand/mark.svg" width="88" height="88" alt="iconwright"></p>

<h1 align="center">iconwright</h1>

<p align="center"><b>Design icons with your agent. See them where they live.</b><br>
An MCP server, CLI and web studio for icons, and for the Windows taskbar and desktop.</p>

<p align="center"><a href="https://iconwright.guptajayam.com">Website</a> · <a href="https://iconwright.guptajayam.com/docs/getting-started">Docs</a> · <a href="https://iconwright.guptajayam.com/studio/">Studio</a> · <a href="https://iconwright.guptajayam.com/llms.txt">llms.txt</a></p>

---

Tell your agent what you want. iconwright finds the artwork among 200,000+ open-source icons, lays out options side by side, shows each one on a real taskbar, desktop and phone, then makes the files, or puts the icon straight onto your Windows taskbar.

![A design grid: three rocket icons in four styles](https://iconwright.guptajayam.com/img/grid.png)

## What it does

**Design (Windows, macOS, Linux)**

- **Search** Iconify's open-source sets and brand logos; results come back as one numbered sheet.
- **Compare** artwork × styles in one small grid; pick a cell like “B2”.
- **Preview** on a Windows taskbar, Start menu, desktop, File Explorer, a browser tab, the macOS Dock, iOS and Android, plus true pixel sizes.
- **Export** Windows `.ico`, macOS `.icns`, a complete favicon and web-app set, or PNGs at every size.
- **Studio**: the same, by hand, in your browser, [online](https://iconwright.guptajayam.com/studio/) or locally.

**Windows**

- **Restyle app icons**, one app or your whole taskbar in one call (for example: every icon white, each from its own logo).
- **Pin, unpin and reorder** taskbar apps in a single Explorer restart, with a dry run first if you like.
- **Desktop**: change icons, arrange, resize, show and hide system icons, save and restore layouts.
- **Undo**: original icons are recorded and the pinned-apps list is backed up before every change. Save a desktop layout before rearranging icons.

## Install

**Claude Code**: run inside Claude Code:

```text
/plugin marketplace add JayceeGupta/iconwright
/plugin install iconwright@icon-playground
```

**Codex, Cursor, VS Code and other MCP clients**: clone, install, and register the stdio server:

```bash
git clone https://github.com/JayceeGupta/iconwright
cd iconwright && npm install
# then point your client at:  node <path>/iconwright/bin/iconwright-mcp.mjs
```

**Or let your agent do it**: paste the [setup prompt](docs/agents.md#setup-prompt).

Requires Node.js 20+. Taskbar and desktop features need Windows 10 or 11 and no administrator rights.

## Try it

> Design me a calm, minimal icon for a notes app and show me some options.
>
> Make all my taskbar icons white.
>
> Pin Notepad, unpin Edge, and put Notepad first.
>
> Undo all my icon changes.

Or from a terminal:

```bash
node bin/iconwright.mjs design ph:rocket-launch-fill tabler:rocket --styles "color=white bg=#2d5ba6 shape=squircle|color=#e9c46a bg=#1f2228 shape=circle" --out grid.png
node bin/iconwright.mjs make ph:rocket-launch-fill --style "color=white bg=#2d5ba6 shape=squircle" --formats ico,icns,web
node bin/iconwright.mjs studio
```

## Docs

| | |
| --- | --- |
| [Getting started](docs/getting-started.md) | Install and a first icon in five minutes |
| [Design icons](docs/design.md) | The design loop, style strings, export formats, tips |
| [The studio](docs/studio.md) | The visual editor |
| [Taskbar and apps](docs/taskbar.md) / [Desktop](docs/desktop.md) | What each Windows change does |
| [For agents](docs/agents.md) | Setup prompt and how to drive the tools well |
| [MCP tools](docs/tools.md) / [Command line](docs/cli.md) | Reference |
| [Safety and risks](docs/safety.md) | What changes, how to undo it, what could go wrong |
| [Compatibility](docs/compatibility.md) / [How it works](docs/how-it-works.md) | Testing status and internals |

## Safety in one paragraph

Designing and exporting changes nothing but the files you ask for. App and desktop icon changes edit shortcut settings and are fully undoable. Pinning edits an undocumented Windows setting and restarts Explorer (open File Explorer windows close); iconwright backs it up first and rolls back on failure. Read [Safety and risks](docs/safety.md) before your first pin change.

## License

MIT. Icons from Iconify keep their own licenses, which iconwright reports with every search. The bundled Inter font is under the SIL Open Font License.
