# Windows internals (verified 2026-10-27, Win11 26200 + StartAllBack 3.9)

Hard-won findings behind `scripts/win/`, for contributors. Read this before changing the pin, icon or
desktop logic. For a plain-language overview, see [How it works](how-it-works.md).

## Where a taskbar button's icon comes from
- **Running app with an explicit AppUserModelID** (Electron apps like T3 Code, VS Code): the icon
  of the Start Menu shortcut carrying that ID. Changing that shortcut's icon + `SHChangeNotify(UPDATEITEM)`
  updates the button **live**. Changing the pinned .lnk alone does nothing while the app runs.
  `WM_SETICON` on the window does nothing either.
- **Pinned, not running / apps without an explicit ID**: the pinned .lnk's icon, read when Explorer
  starts. Needs an Explorer restart (`refresh`) to show.
- Windows caches icons by file path → write each new look to a new file name (`apply` adds a style hash).

## Pinning
- `IPinnedList3::Modify` / `LegacyModify` (CLSID_TaskbandPin `90AA3A4E-…`, IID `0DD79AE2-…`) return S_OK
  but are **silently ignored outside explorer.exe**. Read methods (`IsPinned`, `GetChangeCount`) work.
- The "Pin to taskbar" verb only appears inside Explorer. Invoking it through Explorer's own
  `Shell.Application` (desktop view or a folder window) fails: `DoIt` → E_INVALIDARG, `InvokeVerb` → no-op.
- **What works**: write `HKCU\…\Explorer\Taskband` while Explorer is stopped, then start it.
  - `Favorites` = `{0x00, u32 cb, PIDL}* 0xFF`; `FavoritesResolve` = `{u32 cb, .lnk bytes}*`, same order.
  - PIDL = `UserPinned` known-folder item + `TaskBar` item (copied from an existing entry) + the file item.
  - The file item **must** carry three extra blocks, or Explorer keeps the entry but never shows it:
    `BEEF001E` `02 00`+"UserPinned\0" (UTF-16), `BEEF002B` FILETIME, `BEEF001D` `02 00`+AppID\0.
    Each block: `cb u16, ver u16=0, sig u32, payload, u16 offset-of-first-block`.
  - AppID = explicit ID if the shortcut has one, else the `Get-StartApps` AppID (e.g. `{1AC14E77-…}\charmap.exe`).
- Windows auto-restarts the shell after `Stop-Process explorer`. Writing right after the kill wins the race.

## Side effects
- Restarting Explorer twice within ~30 s trips TranslucentTB's failsafe (taskbar falls back to the accent
  color, from `Explorer\Accent\AccentPalette`). The script samples the taskbar color before/after and
  only flags a change from a custom color to a stock one, and only if a styling tool was running
  (without one, the accent shade can drift between restarts). Styling tools that died are relaunched.
  `--cooldown <s>` spaces restarts for long batches. Context changes (TranslucentTB going clear on the
  desktop) are normal and not flagged.
- MCP clients start servers with a trimmed environment (no `ProgramData`/`WINDIR`): resolve folders via
  `[Environment]::GetFolderPath`, never env vars.
- All-users Start Menu shortcuts (`C:\ProgramData\…`) need admin; reported as `skipped`.
- Console apps (PowerShell, cmd) run inside Windows Terminal when it's the default terminal, so their
  running button is Terminal's. Use a GUI app to test.

## Safety around pin-list writes
- Writers parse `Favorites` and `FavoritesResolve` strictly (`Taskband.Strict`): every record must
  parse, `Favorites` must end in a single `0xFF`, and both lists must have the same length. Anything
  else throws instead of rewriting a list that was only partly understood.
- `Invoke-WithExplorerStopped` snapshots both values first. If the action throws, the snapshot is
  written back before Explorer restarts.
- Backups in `%LOCALAPPDATA%\iconwright\backups\`: `original\` (once, before the first change) and
  `last\` (before every change; written to `pending\` and promoted only if the change succeeds).
  Each holds `taskband.reg` (reg export) and `TaskBar\` (the pinned shortcuts). Older versions wrote
  `taskband-<stamp>.reg` + `TaskBar-folder-<stamp>`; `restore-pins --from original` still reads those.
- `reg.exe` prints its status to stderr, which PowerShell 5.1 turns into an error under
  `$ErrorActionPreference = 'Stop'`; `Invoke-Reg` runs it with `Continue` and checks the exit code.
- Mutating commands hold the named mutex `Local\iconwright-change`.
- After the restart, `Wait-Taskbar` polls for `Shell_TrayWnd`. Explorer is started by hand only if
  Windows didn't restart it within 8 s (a second `explorer.exe` would open a File Explorer window).
- `state.json` holds each changed item's original icon for `restore` / `restore-all`.

## Taskbar order
Pin order = entry order in `Favorites` (with `FavoritesResolve` kept in the same order). `reorder`
rewrites both while Explorer is stopped (one restart). Verified: Explorer keeps the new order.

## Desktop icons (all live, no restart)
- Reached like the taskbar shell object: `ShellWindows.FindWindowSW(SWC_DESKTOP)` → `IShellBrowser` →
  `QueryActiveShellView` → `IFolderView2`. Works cross-process (COM marshals the PIDLs).
- Items: `ItemCount/Item` + `SHGetNameFromIDList` (desktop child PIDLs are absolute). Positions:
  `GetItemPosition` / `SelectAndPositionItems(SVSI_POSITIONITEM)`; auto-arrange is turned off first.
  Positions are quantized to the icon grid (`GetSpacing`, e.g. 150×210 px at 200% scale) even with
  "align to grid" off.
- Size: `SetViewModeAndIconSize(FVM_ICON, px)`. Flags: `SetCurrentFolderFlags` (FWF_AUTOARRANGE,
  FWF_SNAPTOGRID, FWF_NOICONS).
- Persist: explorer saves the desktop layout only on a clean exit, so we call `IShellView::SaveViewState`
  after changes and before every forced Explorer restart.
- Icons: `.lnk` → IconLocation; `.url` → `IconFile`/`IconIndex`; folders → `desktop.ini`
  `IconResource` (+ReadOnly on the folder, Hidden+System on the ini); system icons (This PC,
  Recycle Bin…) → `HKCU\…\Explorer\CLSID\{clsid}\DefaultIcon` (Recycle Bin also `empty`/`full`) +
  `SHCNE_ASSOCCHANGED`. Plain files can't have per-file icons (type-based).
- System icon visibility: `HKCU\…\HideDesktopIcons\NewStartPanel\{clsid}` = 1 hidden / 0 shown, then
  refresh the desktop view.
- Label text color isn't configurable (always white with shadow).
