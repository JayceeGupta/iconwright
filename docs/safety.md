# Safety and risks

iconwright changes real settings on your PC. This page lists exactly what it touches, how to undo each change, and what could go wrong.

**Short version:** icon changes are small and fully undoable. Pinning, unpinning and reordering are the riskiest part. They edit an undocumented Windows setting and restart Explorer, so iconwright backs up the pinned-apps list before every change.

## What iconwright changes

| Feature | What it changes | Undo |
|---|---|---|
| App icon (`apply`, `set-icon`) | The icon setting inside the app's Start Menu shortcut and pinned shortcut (`.lnk` files). The app itself isn't modified. | `restore <app>` |
| Pin, unpin, reorder | The pinned-apps list in the registry (`HKCU\…\Explorer\Taskband`) and the shortcut files in your pinned-apps folder. **Restarts Explorer.** | `restore-pins` |
| Desktop shortcut or link icon | The icon setting inside that `.lnk` or `.url` file | `desktop restore <item>` |
| Desktop folder icon | A hidden `desktop.ini` file inside the folder; the folder is marked read-only (the standard Windows way to show a custom folder icon) | `desktop restore <item>` |
| This PC, Recycle Bin, etc. icon | A per-user registry override (`HKCU\…\Explorer\CLSID\{id}\DefaultIcon`) | `desktop restore <name>` |
| Show or hide system desktop icons | The same setting as *Settings → Personalization → Themes → Desktop icon settings* | `desktop system <name> --show` |
| Desktop icon positions, size, options | Explorer's saved desktop layout | `desktop load <file>` if you saved one first (`desktop save`) |

iconwright only changes settings for **your Windows user**. It never needs administrator rights. Shortcuts shared by all users (in `C:\ProgramData`) are skipped and reported as `skipped`.

Nothing is sent anywhere. The only network request is downloading icons from [Iconify](https://iconify.design) when you use an Iconify name.

### Files iconwright keeps

All in `%LOCALAPPDATA%\iconwright\`:

| Path | What |
|---|---|
| `icons\` | The icons it made. **Your shortcuts point at these files**: deleting them makes the icons go blank. |
| `state.json` | The original icon of everything iconwright changed, for `restore`. |
| `backups\original\` | The pinned-apps list from before iconwright first changed it. Kept forever. |
| `backups\last\` | The pinned-apps list from before the most recent pin, unpin or reorder. |
| `bin\` | A small compiled helper (built on first use from `scripts/win/Iconwright.Win.cs`). |
| `captures\` | Screenshots from `capture`. |

## Explorer restarts

Windows only reads the pinned-apps list when Explorer starts, so **pin, unpin, reorder and refresh restart Explorer**. When that happens:

- The taskbar and desktop disappear for one to three seconds and come back.
- **Open File Explorer windows close.** Other apps keep running.
- Tray icons of some apps may take a moment to reappear.

iconwright makes this as safe as it can:

- It saves the desktop layout first, so icon positions aren't lost.
- It batches: `pin "A" "B" "C"` restarts Explorer once, not three times.
- It waits until the taskbar is actually back before reporting success, and starts Explorer itself if Windows doesn't.
- Only one change runs at a time, even if an agent sends several at once.

### Taskbar styling tools

Tools like **TranslucentTB** switch themselves off if Explorer restarts twice within about 30 seconds (a safety feature). iconwright:

- checks the taskbar color before and after each restart and tells you if the styling was lost,
- restarts TranslucentTB, TaskbarX or RoundedTB if they stopped,
- offers `--cooldown <seconds>` to space out restarts when you run many changes. You can also set the `ICONWRIGHT_RESTART_COOLDOWN` environment variable.

**StartAllBack** works fine; it's what iconwright was developed on.

## How to undo everything

```bash
node bin/iconwright.mjs restore --all               # every app and desktop icon back to the original
node bin/iconwright.mjs restore-pins --from original # pinned apps as they were before iconwright
node bin/iconwright.mjs refresh                     # make sure pinned icons reload
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

Ordered from most to least likely to matter:

1. **Windows updates could break pinning.** The pinned-apps list uses a binary format Microsoft doesn't document. iconwright refuses to edit it if the layout looks unfamiliar (it fails safely with an error), but a future Windows version could change how it's read. Icon changes and desktop features use documented interfaces and are much less exposed.
2. **Explorer restarts are disruptive.** See above. Run pin, unpin and reorder when you're not in the middle of something in File Explorer.
3. **Limited testing.** iconwright has been tested on one Windows 11 PC (see [Compatibility](compatibility.md)). The stock Windows 11 taskbar, Windows 10, multiple monitors and non-English Windows haven't been tested yet.
4. **App updates can undo custom icons.** Some apps recreate their Start Menu shortcut when they update. Run `apply` again afterwards.
5. **The first pin needs an existing pin.** iconwright copies part of the pin format from an existing pinned app. If nothing is pinned, it stops with a clear error; pin any app by hand first.
6. **Security software might object.** iconwright compiles a small helper with PowerShell's `Add-Type` and edits the registry. Some antivirus tools flag that pattern. It hasn't happened in testing.
7. **Store apps** (like Apple Music): the pinned icon changes, but the icon of the running window may stay the app's own.

## Things iconwright can't do

- Give a single ordinary file (like a `.txt`) its own icon. Windows picks those by file type. Use a shortcut to the file instead.
- Change the color of desktop icon labels (Windows always draws them white with a shadow).
- Change icons of apps for other Windows users.
