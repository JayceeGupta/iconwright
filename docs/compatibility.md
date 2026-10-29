# Compatibility

iconwright 0.2 is an early release. This page says what has been tested, on what, and how.

## Operating systems

| | Design and export | Taskbar and app icons | Desktop |
|---|---|---|---|
| **Windows 11** | Yes | Yes (tested) | Yes (tested) |
| **Windows 10** | Yes | Should work, not tested | Should work, not tested |
| **macOS** | Yes (tested in CI) | No | No |
| **Linux** | Yes (tested in CI) | No | No |
| **Any browser** | Yes, in the online [studio](studio.md) | No | No |

On macOS and Linux, iconwright offers the design tools: search, design grids, scene previews, export, and the local studio. The Windows commands say they're Windows-only instead of failing in confusing ways. The MCP server doesn't list the Windows tools there at all.

**Why not Linux or macOS?** The taskbar and desktop features are built on Windows-only parts of the system: shortcut files, Explorer, the Windows registry. Linux desktops (GNOME, KDE) and macOS use completely different mechanisms (`.desktop` files and icon themes, or app bundles and the Dock). Supporting them would mean writing a separate version of the apply layer for each. It's possible, but not planned for now.

## What has been tested

All on one PC: **Windows 11 build 26200**, 200% display scaling, one monitor, English, with **StartAllBack 3.9** (a taskbar replacement) and **TranslucentTB**. Node 24.

| Feature | How it was checked |
|---|---|
| Change a running app's icon (T3 Code, an Electron app) | Seen on screen, via the CLI and via MCP |
| Change a Store app's pinned icon (Apple Music) | Seen on screen |
| Pin a classic app (Character Map) and an Electron app | Seen on screen; the pinned button merges with the running window |
| Pin two apps in one restart; unpin | Seen on screen |
| Pin, then move the new pin to position 2, in one restart; then unpin (`pins`) | Pin order read back: identical to before |
| Dry run of mixed pin, unpin and order requests, including duplicates and conflicts | Results checked against the live pin list; nothing changed |
| Reorder pinned apps | Order read back after the restart, and seen on screen |
| Undo pin changes from backups (`restore-pins`) | Pin order read back before and after |
| Roll back a failed pin-list write | Forced failure; the registry bytes came back identical |
| Desktop: move, arrange, size, auto-arrange, hide icons, show and hide system icons, re-icon a shortcut, restore, save and load a layout | Seen on screen (desktop screenshots) |
| `restore --all` | Icon read back after restoring |
| Restyle two pinned apps at once from their own icons, then restore (MCP) | Icon settings read back: changed, then exactly the originals |
| Extract an app's own icon (custom `.ico`, `.exe` resources, Steam) | Images checked by eye: 256 px with transparency |
| Desktop `.url` with non-ASCII text, and a folder without `desktop.ini`: set and restore | Files compared byte for byte after restore |
| Pin and unpin through MCP with the trimmed environment MCP clients use | Pin count read back |
| A failed pin-list change | Forced failure: registry bytes and pinned shortcut files came back; the `last` backup was untouched |
| TranslucentTB failsafe detection | Seen on screen |
| Fresh install as a Claude Code plugin (local marketplace) | Installed into a clean Claude config; MCP server connected; an agent used `doctor`, `taskbar_status` and `capture` |
| Codex through MCP | Registered with `codex mcp add`; an agent used `doctor`, `taskbar_status` and `capture` |
| Design grid with `app:` sources, scene previews with the user's own pinned apps, web and `.icns` export (MCP) | Images checked by eye; `.ico`, `.icns` and zip files checked by parsing them |
| Local studio (search, ideas, kept versions, app icons, downloads) and hosted studio API | Used in a browser; hosted mode refuses file paths and unsafe SVG |
| Icon making on Linux and macOS | GitHub Actions on Ubuntu and macOS |

## Not tested yet

- The **stock Windows 11 taskbar** (without StartAllBack). The pin format is Windows' own, so it's expected to work, but it hasn't been checked.
- **Windows 10**, **multiple monitors** (arranging per monitor is implemented but untested), **non-English Windows**, **100% and 150% scaling**.
- **Explorer Patcher**, **Windhawk** taskbar mods, **Start11**.
- **Pinning when no app is pinned yet.** iconwright stops with a clear error by design.
- Running as **administrator**, and shortcuts shared by all users.
- The running-window icon of **Store apps**.
- Installing the Claude Code plugin **from GitHub** (only a local copy was tested).

If you try iconwright on one of these, please [open an issue](https://github.com/JayceeGupta/iconwright/issues) with the output of `node bin/iconwright.mjs doctor`, whether it worked or not.

## Readiness

| Area | Status | Why |
|---|---|---|
| Making icons | **Beta** | Automated tests on three OSes; many source formats. |
| Design grids, scenes, studio | **Beta** | New in 0.2; tested on Windows and in CI. Scene geometry follows published platform sizes, not pixel captures. |
| App icons | **Beta** | Uses documented shortcut settings; confirmed on screen for several app types. |
| Desktop | **Beta** | Uses documented Windows interfaces; confirmed on screen. Tested on one PC. |
| Pin, unpin, reorder | **Experimental** | Works and is backed up, but depends on an undocumented format that Windows updates could change. |
| MCP, CLI, plugin | **Beta** | Tested end to end with Claude Code and Codex on one PC. |

## Requirements

- Node.js 20 or newer.
- Windows PowerShell 5.1 (included with Windows 10 and 11). PowerShell 7 isn't needed.
- No administrator rights.
- Internet access only for Iconify icon names and the one-time install of the image library.
