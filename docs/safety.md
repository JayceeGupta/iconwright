# Safety and risks

iconwright changes real settings on your PC. This page lists exactly what it touches, how to undo each change, and what could go wrong.

**Short version:** designing and exporting icons changes nothing on your PC except the files you ask for. Icon changes are small and fully undoable. Pinning, unpinning and reordering are the riskiest part: they edit an undocumented Windows setting and restart Explorer, so iconwright backs up the pinned-apps list before every change and rolls back if anything fails.

## What iconwright changes

| Feature | What it changes | Undo (agent tool) |
|---|---|---|
| Design, preview, export | Nothing on the PC; files only where you ask (`make_icon`) | Delete the files |
| App icon (`app_apply_icon`) | The icon setting inside the app's Start menu shortcut and pinned shortcut (`.lnk` files). The app itself isn't modified. | `restore_icons` |
| Pin, unpin, reorder (`taskbar_pins`) | The pinned-apps list in the registry (`HKCU\…\Explorer\Taskband`) and the shortcut files in your pinned-apps folder. **Restarts Explorer.** | `taskbar_restore_backup` |
| Desktop shortcut or link icon | The icon setting inside that `.lnk` or `.url` file | `restore_icons` |
| Desktop folder icon | A hidden `desktop.ini` file inside the folder; the folder is marked read-only (the standard Windows way to show a custom folder icon) | `restore_icons` |
| This PC, Recycle Bin and other system icons | A per-user registry override (`HKCU\…\Explorer\CLSID\{id}\DefaultIcon`) | `restore_icons` |
| Show or hide system desktop icons | The same setting as *Settings → Personalization → Themes → Desktop icon settings* | `desktop_settings` |
| Desktop icon positions, size, auto-arrange | Explorer's saved desktop layout | `desktop_layout` load (save a layout first) |

iconwright only changes settings for **your Windows user**. It never needs administrator rights. Shortcuts shared by all users (in `C:\ProgramData`) are skipped and reported as `skipped`.

Nothing is sent anywhere. The only network requests are icon searches and downloads from [Iconify](https://iconify.design). The online [studio](studio.md) is the one exception you choose to use: it renders designs on iconwright's server and stores nothing.

### Files iconwright keeps

All in `%LOCALAPPDATA%\iconwright\`:

| Path | What |
|---|---|
| `icons\` | The icons it made. **Your shortcuts point at these files**: deleting them makes the icons go blank. |
| `state.json` | The original icon of everything iconwright changed, for undo. |
| `backups\original\` | The pinned-apps list from before iconwright first changed it. Kept forever. |
| `backups\last\` | The pinned-apps list from before the most recent pin change. |
| `cache\` | Downloaded Iconify artwork and extracted app icons, to make repeat designs fast. Safe to delete. |
| `desktop-layout.json` | Your saved desktop layout, if you saved one without naming a file. |
| `bin\` | A small compiled helper (built on first use from `scripts/win/Iconwright.Win.cs`). |
| `captures\` | Screenshots from `capture`. |

## Explorer restarts

Windows only reads the pinned-apps list when Explorer starts, so **pin changes, refresh and restoring a pin backup restart Explorer**. When that happens:

- The taskbar and desktop disappear for one to three seconds and come back.
- **Open File Explorer windows close.** Other apps keep running.
- Tray icons of some apps may take a moment to reappear.

iconwright keeps this as gentle as it can:

- It batches: pinning three apps, unpinning one and moving another is one call and one restart.
- It can do a dry run that shows the resulting order without changing anything.
- It saves the desktop layout first, so icon positions aren't lost.
- It stops only the Explorer process that owns the taskbar, waits until a new taskbar is really there before reporting success, and starts Explorer itself if Windows doesn't.
- Only one change runs at a time, even if an agent sends several at once.

### Taskbar styling tools

Tools like **TranslucentTB** switch themselves off if Explorer restarts twice within about 30 seconds (a safety feature). iconwright:

- checks the taskbar color before and after each restart and tells you if the styling was lost,
- restarts TranslucentTB, TaskbarX or RoundedTB if they stopped,
- can wait between restarts on request (`restartCooldown`, in seconds) when you make many changes in a row.

**StartAllBack** works fine; it's what iconwright was developed on.

## How to undo everything

Ask your agent: “Undo everything iconwright changed, including my pinned apps.” Or run:

```bash
node bin/iconwright.mjs restore --all                 # every app and desktop icon back to the original
node bin/iconwright.mjs restore-pins --from original  # pinned apps as they were before iconwright
node bin/iconwright.mjs refresh                       # make sure pinned icons reload
```

Then you can delete `%LOCALAPPDATA%\iconwright\` and uninstall the plugin (`/plugin uninstall iconwright` in Claude Code).

### If the taskbar looks wrong and iconwright can't fix it

The pinned-apps backups are ordinary Windows files, so you can restore them by hand:

1. Open `%LOCALAPPDATA%\iconwright\backups\last\` (or `original\`).
2. Copy the shortcuts from its `TaskBar` folder into `%APPDATA%\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar`.
3. Double-click `taskband.reg` and confirm.
4. Restart Explorer: open Task Manager, find **Windows Explorer**, right-click it and choose **Restart**.

If the taskbar disappears and doesn't come back: press **Ctrl+Shift+Esc** to open Task Manager, choose **Run new task**, type `explorer.exe` and press Enter.

## Known risks

From most to least likely to matter:

1. **Windows updates could break pinning.** The pinned-apps list uses a binary format Microsoft doesn't document. iconwright refuses to edit it if the layout looks unfamiliar (it fails safely with an error), but a future Windows version could change how it's read. Icon changes and desktop features use documented interfaces and are much less exposed.
2. **Explorer restarts are disruptive.** See above. Make pin changes when you're not in the middle of something in File Explorer.
3. **Limited testing.** iconwright has been tested on one Windows 11 PC (see [Compatibility](compatibility.md)). The stock Windows 11 taskbar, Windows 10, multiple monitors and non-English Windows haven't been tested yet.
4. **App updates can undo custom icons.** Some apps recreate their Start menu shortcut when they update. Apply the icon again afterwards.
5. **The first pin needs an existing pin.** iconwright copies part of the pin format from an app that's already pinned. If nothing is pinned, it stops with a clear error; pin any app by hand first.
6. **Security software might object.** iconwright compiles a small helper with PowerShell's `Add-Type` and edits the registry. Some antivirus tools flag that pattern. It hasn't happened in testing.
7. **Store apps** (like Apple Music): the pinned icon changes, but the icon of the running window may stay the app's own.
8. **The local studio is a web server.** It listens only on `127.0.0.1` and requires a per-session secret token, so websites can't reach it. Close it when you're done.

## Things iconwright can't do

- Give a single ordinary file (like a `.txt`) its own icon. Windows picks those by file type. Use a shortcut to the file instead.
- Change the color of desktop icon labels (Windows always draws them white with a shadow).
- Change icons of apps for other Windows users.
