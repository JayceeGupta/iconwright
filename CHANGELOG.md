# Changelog

## 0.1.0 (2026-10-27)

First public version.

- Make `.ico` icons (256 to 16 px) from Iconify names, SVG, PNG, JPEG, WebP or existing `.ico` files, with recolor, backplate, padding and preview images. Works on Windows, macOS and Linux.
- Windows: change app icons on the taskbar, Start Menu and pinned shortcuts; pin, unpin and reorder taskbar apps; move, arrange, resize, re-icon, show and hide desktop icons; save and load desktop layouts.
- Undo: `restore <app>`, `restore --all`, `desktop restore`, and `restore-pins` (pin list backups taken before every change).
- Safety: pin-list writes refuse unfamiliar layouts, roll back on failure, and run one at a time. `doctor` checks a PC before use.
- Interfaces: CLI, MCP server (stdio), Claude Code plugin with a skill, and Codex via MCP.
