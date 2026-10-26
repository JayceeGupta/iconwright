# Getting started

This guide takes about five minutes. By the end you'll have changed an app's taskbar icon, checked the result and undone it.

## 1. Install

You need **Windows 10 or 11** and **[Node.js](https://nodejs.org) 20 or newer**. Check Node with `node --version`.

### Claude Code

In Claude Code, run:

```text
/plugin marketplace add JayceeGupta/iconwright
/plugin install iconwright@icon-playground
```

Restart Claude Code if it asks. The plugin adds:

- an **MCP server** with the iconwright tools, and
- a **skill** that tells Claude how to use them well (preview first, batch Explorer restarts, offer undo).

### Codex

Clone the repository, then register the MCP server:

```bash
git clone https://github.com/JayceeGupta/iconwright
codex mcp add iconwright -- node C:/path/to/iconwright/bin/iconwright-mcp.mjs
```

Codex asks for approval before each MCP tool call. In `codex exec` (non-interactive) mode there's no one to ask, so calls are blocked unless you pre-approve them. To pre-approve the read-only tools, add this to `~/.codex/config.toml`:

```toml
[mcp_servers.iconwright.tools.doctor]
approval_mode = "approve"

[mcp_servers.iconwright.tools.taskbar_status]
approval_mode = "approve"

[mcp_servers.iconwright.tools.capture]
approval_mode = "approve"
```

Only pre-approve tools that change your system (`apply_icon`, `pin_apps`, …) if you're comfortable with Codex running them without asking.

### Other MCP clients

Point your client at this stdio command:

```text
node C:/path/to/iconwright/bin/iconwright-mcp.mjs
```

### Command line only

```bash
git clone https://github.com/JayceeGupta/iconwright
cd iconwright
node bin/iconwright.mjs help
```

The first command you run installs the image library iconwright needs (`sharp`). That takes about 10 seconds once.

## 2. Check your PC

Ask your agent *"run the iconwright doctor"*, or run:

```bash
node bin/iconwright.mjs doctor
```

`"ok": true` means you're ready. If a check fails, its `detail` says why. The most common one is `pinPrefix`: iconwright needs **at least one app already pinned** to the taskbar before it can pin others. Pin any app by hand once and you're set.

## 3. Change an icon

Find the app's exact name:

```bash
node bin/iconwright.mjs apps spotify
```

Make an icon and apply it in one step:

```bash
node bin/iconwright.mjs apply "Spotify" --source simple-icons:spotify --color white
```

With an agent, just say *"make my Spotify taskbar icon white"*.

What happens:

- iconwright downloads the Spotify logo from [Iconify](https://icon-sets.iconify.design), colors it white and saves it as `.ico` (plus a preview PNG) in `%LOCALAPPDATA%\iconwright\icons`.
- It points the app's Start Menu shortcut and pinned shortcut at the new icon. It remembers the old icon first.
- If Spotify is running, its taskbar button changes right away. Some older apps only show the change after Explorer restarts. When that's the case, the result includes a `hint`, and running `refresh` once applies it.

### Want to see it first?

`make` creates the icon without applying it, and returns a preview image of the icon at 48 and 24 px on dark and light backgrounds:

```bash
node bin/iconwright.mjs make --source simple-icons:spotify --color "#1db954" --bg "#191414" --shape circle
```

Agents using MCP get the preview image directly, so they can show it to you or compare options.

### Icon sources

| Source | Example |
|---|---|
| Iconify name: 200,000+ icons, including brand logos | `mdi:music`, `simple-icons:discord`, `lucide:terminal` |
| An image file | `C:/Pictures/logo.png`, `logo.svg`, `photo.webp` |
| An existing `.ico` (recolor it) | `D:/Icons/old.ico` |
| Raw SVG text | `<svg …>…</svg>` |

Search Iconify with `search`, for example `node bin/iconwright.mjs search "music note"`.

## 4. Check the result

```bash
node bin/iconwright.mjs capture taskbar
```

This saves a screenshot of the taskbar (to `%LOCALAPPDATA%\iconwright\captures\taskbar.png`). Over MCP the agent gets the image itself, so it can confirm its own work. `capture desktop` shows the desktop icons even when windows cover them.

## 5. Undo

```bash
node bin/iconwright.mjs restore "Spotify"        # this app's original icon
node bin/iconwright.mjs restore --all            # every icon iconwright changed
node bin/iconwright.mjs restore-pins             # pinned apps as before the last pin/unpin/reorder
```

See [Safety and risks](safety.md) for everything iconwright changes and how to undo it.

## More things to try

```bash
# Pin two apps in one Explorer restart, then move them to the front
node bin/iconwright.mjs pin "Notepad" "Calculator"
node bin/iconwright.mjs reorder "Notepad" "Calculator" --position 0

# Desktop
node bin/iconwright.mjs desktop save C:/Users/me/desktop-backup.json
node bin/iconwright.mjs desktop arrange --corner top-right
node bin/iconwright.mjs desktop size small
node bin/iconwright.mjs desktop system recycle-bin --hide
node bin/iconwright.mjs desktop apply "My Projects" --source mdi:folder-star --color "#f59e0b"
```

The full list is in [Commands](commands.md).
