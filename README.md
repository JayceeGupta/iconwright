# iconwright

iconwright creates Windows `.ico` files and previews from Iconify IDs, SVGs, or raster images. Its Windows tools can find Start Menu apps, update shortcut icons, and manage taskbar pins.

## Install

Claude Code plugin:

```text
/plugin marketplace add <path-or-repo>
/plugin install iconwright@icon-playground
```

Codex MCP:

```text
codex mcp add iconwright -- node <path>/bin/iconwright-mcp.mjs
```

Or add to `~/.codex/config.toml`:

```toml
[mcp_servers.iconwright]
command = "node"
args = ["<path>/bin/iconwright-mcp.mjs"]
```

Any MCP client can launch `node <path>/bin/iconwright-mcp.mjs` over stdio. The launcher installs production dependencies on first start when `node_modules/sharp` is missing.

## CLI

```text
Usage: iconwright <command> [options]

  search <query> [--limit N]
  make --source <ref> [options]
  sheet <files...> --out path
  apps [query]                          list Start menu apps (name + AppID)
  info <app...>                         shortcuts, AppID, pin state
  set-icon <app> --icon f.ico [--index n]  apply an existing icon
  apply <app> (--source ref [--color --bg --shape --radius --padding --name] | --icon f.ico) [--pin]
  pin <app...> [--icon f.ico] [--no-restart] [--cooldown s]  (restarts explorer once)
  unpin <app...> [--no-restart] [--cooldown s]
  restore <app...>                      put the original icons back
  status                                pinned items and their icons
  reorder <app...> [--position n] [--no-restart] [--cooldown s]
  desktop list|move|arrange|size|options|system|apply|restore|save|load ...
  help
```

Desktop commands manage icon positions, size, visibility, system icons, and saved layouts. Changes apply live; item positions snap to the icon grid. `desktop apply` makes and sets an icon in one command. MCP also exposes `reorder_taskbar` and the `desktop_info`, `desktop_move`, `desktop_arrange`, `desktop_icon_size`, `desktop_options`, `desktop_system_icons`, `desktop_apply_icon`, `desktop_restore_icons`, `desktop_layout_save`, and `desktop_layout_load` tools.

## Windows behavior and limits

- For running apps with an AppUserModelID, the icon comes from the Start Menu shortcut carrying that ID; changes update live.
- Pinned items use their pinned `.lnk` shortcut.
- Pinning writes `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband` (`Favorites` and `FavoritesResolve`) and restarts Explorer once.
- Original icons are saved in `%LOCALAPPDATA%\iconwright\state.json` for `restore`.
- App updates may recreate shortcuts, so rerun `apply` after an update.

Store (UWP) apps get their running icon from the package. Editing all-users Start Menu shortcuts requires administrator access.
