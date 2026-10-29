# Getting started

iconwright lets you design icons by talking to an AI agent, and put them on your Windows taskbar and desktop. This page gets it installed and walks you through a first icon. It takes about five minutes.

## What you need

- **Node.js 20 or newer.** Check with `node --version`; get it from [nodejs.org](https://nodejs.org).
- **An agent that speaks MCP**: Claude Code, Codex, Cursor, VS Code or similar. You can also use the [command line](cli.md) or the [studio](studio.md) without one.
- **Windows 10 or 11** for the taskbar and desktop features. Designing and exporting icons works on macOS and Linux too.

## Install

### Claude Code

Run these two commands inside Claude Code:

```text
/plugin marketplace add JayceeGupta/iconwright
/plugin install iconwright@icon-playground
```

Restart Claude Code if it asks. You get the MCP tools, a skill that teaches Claude to use them well, and four commands in the `/` menu: design-icon, restyle-taskbar, tidy-desktop and undo-everything.

### Codex

```bash
git clone https://github.com/JayceeGupta/iconwright
cd iconwright && npm install
codex mcp add iconwright -- node "$PWD/bin/iconwright-mcp.mjs"
```

Codex asks before each tool call. To let it run the read-only tools without asking, add them to `~/.codex/config.toml`:

```toml
[mcp_servers.iconwright.tools.search_icons]
approval_mode = "approve"

[mcp_servers.iconwright.tools.design_icons]
approval_mode = "approve"

[mcp_servers.iconwright.tools.preview_icon]
approval_mode = "approve"

[mcp_servers.iconwright.tools.taskbar_status]
approval_mode = "approve"
```

### Any other MCP client

Clone and install as above, then add a **stdio** server to your client's MCP settings:

```json
{
  "mcpServers": {
    "iconwright": { "command": "node", "args": ["C:/path/to/iconwright/bin/iconwright-mcp.mjs"] }
  }
}
```

### Let your agent do it

Copy the [setup prompt](agents.md#setup-prompt) and paste it to your agent. It installs iconwright, reads the usage guide and checks your PC.

## Your first icon

Ask your agent in plain words. For example:

> Design me a calm, minimal icon for a notes app. Show me a few options.

A good agent will:

1. **Search** for artwork and show you a numbered sheet of candidates.
2. **Compare** a few of them in different styles, in one grid. You answer with a cell, like “B2”.
3. **Preview** your pick on a taskbar, desktop and phone, so you can see it at real sizes.
4. **Make the files** you need: `.ico` for Windows, `.icns` for macOS, a favicon set for a website.

Each step is a single small image, so trying another color or shape is cheap. Say what to change (“warmer”, “less padding”, “try a circle”) and it redraws.

Prefer to drag sliders yourself? Ask for the studio (“open this in the studio”), or open [iconwright studio](/studio/) in your browser.

## Your first taskbar change (Windows)

> Make all my taskbar icons white.

The agent reads your pinned apps and restyles each app's own icon in one call. Open windows update right away; a few pinned icons only update after Explorer restarts, and the agent will offer to do that once at the end.

To undo:

> Put my original icons back.

## Check your PC

On Windows, ask the agent to run **doctor**, or run it yourself:

```bash
node bin/iconwright.mjs doctor
```

It checks your Windows and PowerShell versions, the pinned-apps format, your backups and any taskbar mods, and changes nothing.

## Next

- [Design icons](design.md): the design loop, style strings and export formats.
- [Taskbar and apps](taskbar.md): restyling, pinning and reordering.
- [Safety and risks](safety.md): what iconwright changes and how to undo it.
- [For agents](agents.md): how an agent should drive iconwright.
