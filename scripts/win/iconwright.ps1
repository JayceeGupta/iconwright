<#
.SYNOPSIS
  iconwright Windows layer: find apps, set their taskbar/Start icons, pin/unpin them.
  Every command prints one compact JSON line (for agents / the Node CLI / MCP).

.EXAMPLE
  iconwright.ps1 apps -Query code
  iconwright.ps1 info -App "T3 Code"
  iconwright.ps1 set-icon -App "T3 Code" -Icon C:\path\t3.ico
  iconwright.ps1 pin -App "T3 Code","Notepad" [-NoRestart]   (one explorer restart per call)
  iconwright.ps1 pin -App "T3 Code" -Icon C:\path\t3.ico
  iconwright.ps1 unpin -App "T3 Code"
  iconwright.ps1 restore -App "T3 Code"
  iconwright.ps1 status
#>
param(
  [Parameter(Position = 0)][string]$Command = 'help',
  [string[]]$App,
  [string]$Query,
  [string]$Icon,
  [int]$IconIndex = 0,
  [switch]$NoRestart,
  [int]$RestartCooldown = 0,
  [int]$Position = 0,            # reorder: target index (negative = from the end)
  # desktop-* commands
  [string[]]$Item, [int]$X, [int]$Y, [string]$Value, [string]$File,
  [string]$By, [string]$Corner, [string]$Flow,
  [string]$AutoArrange, [string]$SnapToGrid, [string]$ShowIcons,
  [int]$MaxWidth = 1600,         # capture: downscale wider images to this width (0 = full size)
  [int]$Monitor = 0              # desktop-arrange: which monitor (0 = primary)
)
$ErrorActionPreference = 'Stop'
# Some MCP clients start us without PATHEXT; then PowerShell silently runs no .exe at all.
if (-not $env:PATHEXT) { $env:PATHEXT = '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC' }
Set-StrictMode -Version 2

# Known folders come from the OS, not env vars: MCP clients often start servers with a trimmed environment.
function KF([string]$name) { [Environment]::GetFolderPath([Environment+SpecialFolder]::$name) }
$Home_ = Join-Path (KF LocalApplicationData) 'iconwright'
$StatePath = Join-Path $Home_ 'state.json'
$PinnedDir = Join-Path (KF ApplicationData) 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'
$StartDirs = @(
  (Join-Path (KF ApplicationData) 'Microsoft\Windows\Start Menu\Programs'),
  (Join-Path (KF CommonApplicationData) 'Microsoft\Windows\Start Menu\Programs')
)

function Out-Json($obj) { ConvertTo-Json -InputObject $obj -Compress -Depth 6 }
# Errors are thrown, not exits: the one-shot entry point prints them, the MCP worker returns them.
function Fail([string]$msg) { throw $msg }

# ---------- interop (compiled once per source hash, then cached) ----------
function Import-Interop {
  if ('Iconwright.Taskband' -as [type]) { return }
  $src = Join-Path $PSScriptRoot 'Iconwright.Win.cs'
  $hash = (Get-FileHash $src -Algorithm SHA256).Hash.Substring(0, 12)
  $dll = Join-Path $Home_ "bin\Iconwright.Win.$hash.dll"
  if (-not (Test-Path -LiteralPath $dll)) {
    # Two first calls at once must not both write the DLL: compile under a lock, to a temp
    # name, then rename into place. Older versions' DLLs are removed when not in use.
    $m = New-Object Threading.Mutex($false, 'Local\iconwright-compile')
    try { [void]$m.WaitOne([TimeSpan]::FromSeconds(60)) } catch [Threading.AbandonedMutexException] { }
    try {
      if (-not (Test-Path -LiteralPath $dll)) {
        $bin = Split-Path $dll
        New-Item -ItemType Directory -Force $bin | Out-Null
        $tmp = Join-Path $bin ("build-" + [guid]::NewGuid().ToString('N') + '.dll')
        Add-Type -Path $src -OutputAssembly $tmp -OutputType Library -ReferencedAssemblies System.Drawing
        Move-Item -LiteralPath $tmp -Destination $dll
        Get-ChildItem -LiteralPath $bin -Filter 'Iconwright.Win.*.dll' | Where-Object { $_.FullName -ne $dll } |
          Remove-Item -Force -ErrorAction SilentlyContinue
      }
    } finally { try { $m.ReleaseMutex() } catch { } }
  }
  Add-Type -Path $dll
}

# ---------- state (original icons, for restore) ----------
function Get-State {
  if (Test-Path -LiteralPath $StatePath) {
    $s = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ($s -and $s.PSObject.Properties['originals']) { return $s }
  }
  [pscustomobject]@{ originals = [pscustomobject]@{} }
}
function Save-State($s) {
  New-Item -ItemType Directory -Force $Home_ | Out-Null
  $s | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatePath -Encoding UTF8
}
# Remember a shortcut's icon the first time we touch it.
function Remember-Original($state, [string]$lnk) {
  if (-not $state.originals.PSObject.Properties[$lnk]) {
    $state.originals | Add-Member -NotePropertyName $lnk -NotePropertyValue ([Iconwright.Lnk]::GetIcon($lnk))
  }
}

# ---------- app discovery ----------
$script:shell = $null
function Get-LnkAppId([string]$lnk) {
  if (-not $script:shell) { $script:shell = New-Object -ComObject Shell.Application }
  $item = $script:shell.Namespace((Split-Path $lnk)).ParseName((Split-Path $lnk -Leaf))
  if ($item) { [string]$item.ExtendedProperty('System.AppUserModel.ID') } else { '' }
}

function Get-StartShortcuts {
  foreach ($d in $StartDirs) {
    if (Test-Path -LiteralPath $d) { Get-ChildItem -LiteralPath $d -Recurse -Filter *.lnk -ErrorAction SilentlyContinue }
  }
}

$script:StartAppsCache = $null
function Find-Apps([string]$q) {
  # Get-StartApps costs ~0.5-0.9 s, so one request looks it up once, however many apps it names.
  if ($null -eq $script:StartAppsCache) { $script:StartAppsCache = @(Get-StartApps) }
  $apps = $script:StartAppsCache
  if ($q) {
    if ($q -match '^[A-Za-z]:/') { $q = $q.Replace('/', '\') }   # paths may come back with forward slashes
    $exact = @($apps | Where-Object { $_.Name -eq $q -or $_.AppID -eq $q })
    if ($exact.Count) { return $exact }
    $apps = $apps | Where-Object { $_.Name -like "*$q*" -or $_.AppID -like "*$q*" }
  }
  @($apps)
}

# Resolve an app name/AppID to everything we need to change its icon.
function Resolve-App([string]$name) {
  if (-not $name) { Fail 'Missing -App' }
  $m = @(Find-Apps $name)
  if ($m.Count -eq 0) { Fail "No Start menu app matches '$name'. Find the exact name with list_apps (CLI: iconwright apps <text>)." }
  if ($m.Count -gt 1) {
    Fail ("'$name' is ambiguous: " + (($m | Select-Object -First 8 | ForEach-Object { "$($_.Name) [$($_.AppID)]" }) -join '; '))
  }
  $a = $m[0]
  $isStore = $a.AppID -match '!'
  # Start Menu shortcuts that represent this app: same file name, or same AppUserModelID.
  $lnks = @(Get-StartShortcuts | Where-Object { $_.BaseName -eq $a.Name } | ForEach-Object { $_.FullName })
  if (-not $lnks.Count -and -not $isStore) {
    $lnks = @(Get-StartShortcuts | Where-Object { (Get-LnkAppId $_.FullName) -eq $a.AppID } | ForEach-Object { $_.FullName })
  }
  $target = $null; $appId = $null
  if ($lnks.Count) {
    $target = [Iconwright.Lnk]::GetTarget($lnks[0])
    $appId = Get-LnkAppId $lnks[0]
  }
  if (-not $appId -and ($isStore -or $a.AppID -notmatch '[\\/]')) { $appId = $a.AppID }
  [pscustomobject]@{
    name       = $a.Name
    appId      = $a.AppID
    explicitId = $appId          # AppUserModelID to stamp on shortcuts we create
    store      = $isStore
    target     = $target
    startMenu  = $lnks
    pinned     = @(Get-PinnedFor $a $target $appId)
  }
}

# Pinned taskbar shortcuts belonging to the app. An AppUserModelID match wins; when both
# sides have an ID and they differ, it's another app even if the file name or target matches
# (two apps can share a display name). Without IDs, match by target exe, then by file name.
function Get-PinnedFor($a, [string]$target, [string]$appId) {
  $byName = @()
  foreach ($p in [Iconwright.Taskband]::List()) {
    if (-not $p -or -not $p.EndsWith('.lnk') -or -not (Test-Path -LiteralPath $p)) { continue }
    $id = Get-LnkAppId $p
    if ($appId -and $id) { if ($id -eq $appId) { $p }; continue }
    if ($target -and ([Iconwright.Lnk]::GetTarget($p) -eq $target)) { $p; continue }
    if ([IO.Path]::GetFileNameWithoutExtension($p) -eq $a.Name) { $byName += $p }
  }
  if ($byName.Count -eq 1) { $byName[0] }   # a name-only match must be unambiguous
}

function Test-Writable([string]$path) {
  try { [IO.File]::Open($path, 'Open', 'ReadWrite', 'ReadWrite').Dispose(); $true } catch { $false }
}

# ---------- explorer restart (needed for pin list changes) ----------
# Optional minimum gap between restarts (seconds), for users running long batches.
# Default 0. Set via -RestartCooldown or $env:ICONWRIGHT_RESTART_COOLDOWN.
if (-not $PSBoundParameters.ContainsKey('RestartCooldown') -and $env:ICONWRIGHT_RESTART_COOLDOWN) {
  $RestartCooldown = [int]$env:ICONWRIGHT_RESTART_COOLDOWN
}
$script:RestartReport = $null

# Taskbar styling tools (TranslucentTB etc.) can bail out when explorer restarts.
function Get-StylerProcesses {
  @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^(TranslucentTB|TaskbarX|RoundedTB)$' } |
    ForEach-Object { [pscustomobject]@{ name = $_.ProcessName; path = $_.Path } })
}

# Colors an un-styled taskbar can have: the accent palette (used with "show accent color
# on taskbar") plus stock dark/light. Landing on one of these after a restart, coming from
# something else, means a styling tool stopped applying its look.
function Get-StockTaskbarColors {
  $c = @(0x202020, 0x1C1C1C, 0xF3F3F3, 0xEEEEEE)
  $pal = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Accent' -ErrorAction SilentlyContinue).AccentPalette
  if ($pal) { for ($i = 0; $i + 2 -lt $pal.Length; $i += 4) { $c += ([int]$pal[$i] -shl 16) -bor ([int]$pal[$i + 1] -shl 8) -bor [int]$pal[$i + 2] } }
  $c
}
function Test-StockColor([int]$color) {
  foreach ($s in Get-StockTaskbarColors) { if ([Iconwright.TaskbarColor]::Distance($color, $s) -le 24) { return $true } }
  $false
}

# Pin-list backups in %LOCALAPPDATA%\iconwright\backups:
#   original\  taken once, before iconwright first changes the pin list on this machine
#   last\      taken before every successful change (undo for the most recent change)
# Each holds taskband.reg (registry export) and TaskBar\ (the pinned shortcuts).
# reg.exe prints status to stderr; PowerShell 5.1 would turn that into an error.
function Invoke-Reg([string[]]$argv) {
  $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  # Full path: MCP clients may start us without PATH. A missing reg.exe must fail loudly.
  $reg = Join-Path (KF System) 'reg.exe'
  $global:LASTEXITCODE = -1
  $o = $null
  try { $o = & $reg @argv 2>&1 } finally { $ErrorActionPreference = $eap }
  if ($global:LASTEXITCODE -eq -1) { throw "Could not run ${reg}: $(($o | Out-String).Trim())" }
  $global:LASTEXITCODE
}
$TaskbandKey = 'HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband'
$BackupDir = Join-Path $Home_ 'backups'
function Save-TaskbandBackup([string]$name) {
  $dir = Join-Path $BackupDir $name
  $tmp = "$dir.tmp"
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $tmp | Out-Null
  if ((Invoke-Reg @('export', $TaskbandKey, (Join-Path $tmp 'taskband.reg'), '/y')) -ne 0) { Fail "Could not back up the taskbar pin list (reg export failed); nothing was changed." }
  if (Test-Path -LiteralPath $PinnedDir) { Copy-Item -LiteralPath $PinnedDir -Destination (Join-Path $tmp 'TaskBar') -Recurse }
  Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
  Rename-Item -LiteralPath $tmp -NewName $name
}
function Backup-Taskband {
  $legacy = Get-ChildItem -LiteralPath $BackupDir -Filter 'taskband-*.reg' -ErrorAction SilentlyContinue
  if (-not (Test-Path -LiteralPath (Join-Path $BackupDir 'original')) -and -not $legacy) { Save-TaskbandBackup 'original' }
  Save-TaskbandBackup 'pending'   # becomes 'last' only if the change succeeds
}
function Complete-TaskbandBackup([bool]$ok) {
  $p = Join-Path $BackupDir 'pending'
  if (-not (Test-Path -LiteralPath $p)) { return }
  if ($ok) { Remove-Item -LiteralPath (Join-Path $BackupDir 'last') -Recurse -Force -ErrorAction SilentlyContinue; Rename-Item -LiteralPath $p -NewName 'last' }
  else { Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue }
}
# Resolves a backup name to {reg, folder}. Older versions wrote taskband-<stamp>.reg + TaskBar-folder-<stamp>.
function Get-TaskbandBackup([string]$name) {
  $dir = Join-Path $BackupDir $name
  if (Test-Path -LiteralPath (Join-Path $dir 'taskband.reg')) {
    return [pscustomobject]@{ reg = (Join-Path $dir 'taskband.reg'); folder = (Join-Path $dir 'TaskBar') }
  }
  if ($name -eq 'original') {
    $r = Get-ChildItem -LiteralPath $BackupDir -Filter 'taskband-*.reg' -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -First 1
    if ($r) { return [pscustomobject]@{ reg = $r.FullName; folder = (Join-Path $BackupDir ($r.BaseName -replace '^taskband-', 'TaskBar-folder-')) } }
  }
  $null
}

# Waits up to $seconds for the taskbar window; returns $true when it is there.
function Wait-Taskbar([int]$seconds) {
  $until = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $until) {
    if ([Iconwright.TaskbarColor]::TrayPresent()) { return $true }
    Start-Sleep -Milliseconds 250
  }
  $false
}

# Pinned-folder files before a change, so a failed change can remove what it added.
function Get-PinnedFiles {
  if (-not (Test-Path -LiteralPath $PinnedDir)) { return @() }
  @(Get-ChildItem -LiteralPath $PinnedDir -File -Force | ForEach-Object Name)
}
function Restore-PinnedFiles([string[]]$before) {
  foreach ($f in @(Get-PinnedFiles)) {
    if ($before -notcontains $f) { Remove-Item -LiteralPath (Join-Path $PinnedDir $f) -Force -ErrorAction SilentlyContinue }
  }
  $saved = Join-Path (Join-Path $BackupDir 'pending') 'TaskBar'
  if (Test-Path -LiteralPath $saved) {
    Get-ChildItem -LiteralPath $saved -File -Force | Copy-Item -Destination $PinnedDir -Force
  }
}

function Get-TaskbandValues {
  $k = Get-Item -LiteralPath "Registry::$TaskbandKey" -ErrorAction SilentlyContinue
  if (-not $k) { return $null }
  @{ Favorites = $k.GetValue('Favorites'); FavoritesResolve = $k.GetValue('FavoritesResolve') }
}
function Set-TaskbandValues($v) {
  if (-not $v) { return }
  foreach ($n in 'Favorites', 'FavoritesResolve') {
    if ($null -ne $v[$n]) { Set-ItemProperty -LiteralPath "Registry::$TaskbandKey" -Name $n -Value ([byte[]]$v[$n]) -Type Binary }
  }
}

# Runs a pin-list change safely:
#   1. backs up the pin list and pinned shortcuts (before anything is touched)
#   2. $prepare: file changes (new pinned shortcuts), with explorer still running
#   3. stops the taskbar's explorer.exe, runs $action (registry edits), brings explorer back
# If $prepare or $action throws, the registry values and pinned-folder files are put back.
# With -NoRestart the same steps run without stopping explorer.
function Invoke-PinChange([scriptblock]$prepare, [scriptblock]$action, [switch]$NoBackup) {
  $stamp = Join-Path $Home_ 'last-explorer-restart'
  $restart = -not $NoRestart
  if ($restart -and $RestartCooldown -gt 0 -and (Test-Path -LiteralPath $stamp)) {
    $wait = $RestartCooldown - ((Get-Date) - (Get-Item -LiteralPath $stamp).LastWriteTime).TotalSeconds
    if ($wait -gt 0) { Start-Sleep -Seconds ([math]::Ceiling($wait)) }
  }
  $colorBefore = [Iconwright.TaskbarColor]::Sample()
  $stylers = Get-StylerProcesses
  New-Item -ItemType Directory -Force $Home_ | Out-Null
  if (-not $NoBackup) { Backup-Taskband }   # refresh changes nothing, so it keeps the existing 'last'
  $snapshot = Get-TaskbandValues
  $filesBefore = Get-PinnedFiles
  $failure = $null; $trayBack = $true
  # Returns '' on success, or text to append to the failure message.
  $rollback = {
    try { Set-TaskbandValues $snapshot; Restore-PinnedFiles $filesBefore; '' }
    catch { " (rollback also failed: $($_.Exception.Message); restore with: iconwright restore-pins --from last)" }
  }
  try { if ($prepare) { & $prepare } } catch { $failure = $_.Exception.Message; $failure += (& $rollback) }
  if (-not $failure -and -not $restart) {
    try { & $action } catch { $failure = $_.Exception.Message; $failure += (& $rollback) }
  }
  if (-not $failure -and $restart) {
    Set-Content -LiteralPath $stamp -Value (Get-Date -Format o)
    try { [Iconwright.Desktop]::SaveState() } catch { }   # a forced kill skips explorer's own save
    # Stop only the explorer that owns the taskbar; separate-process folder windows survive.
    $shellPid = [Iconwright.TaskbarColor]::TrayProcessId()
    if ($shellPid) { Stop-Process -Id $shellPid -Force -ErrorAction SilentlyContinue; Wait-Process -Id $shellPid -Timeout 5 -ErrorAction SilentlyContinue }
    else { Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Wait-Process -Name explorer -Timeout 5 -ErrorAction SilentlyContinue }
    try { & $action }
    catch {
      # Put the pin list back exactly as it was before bringing explorer back.
      $failure = $_.Exception.Message
      $failure += (& $rollback)
    }
    finally {
      # Windows normally restarts the shell by itself. Start it only if that didn't happen:
      # a second explorer.exe while a shell runs would just open a File Explorer window.
      if (-not (Wait-Taskbar 8)) {
        Start-Process (Join-Path (KF Windows) 'explorer.exe')
        $trayBack = Wait-Taskbar 20
      }
    }
  }
  if (-not $NoBackup) { Complete-TaskbandBackup (-not $failure) }
  if ($failure) { Fail "Taskbar change failed and was rolled back: $failure" }
  if (-not $trayBack) {
    Fail ("The pin list was changed, but the taskbar did not come back within 30 s. Press Ctrl+Shift+Esc, " +
          "choose 'Run new task', enter explorer.exe. To undo the change: iconwright restore-pins")
  }
  if (-not $restart) { $script:RestartReport = $null; return }
  # Give the taskbar (and any styling tool) time to settle, then compare.
  Start-Sleep -Seconds 3
  $colorAfter = [Iconwright.TaskbarColor]::Sample()
  $relaunched = @()
  $alive = Get-StylerProcesses
  foreach ($s in $stylers) {
    if ($alive | Where-Object { $_.name -eq $s.name }) { continue }
    try {
      # Store apps (e.g. TranslucentTB) can't be started from their WindowsApps path.
      $sa = Get-StartApps | Where-Object { $_.Name -eq $s.name } | Select-Object -First 1
      if ($sa) { Start-Process (Join-Path (KF Windows) 'explorer.exe') "shell:AppsFolder\$($sa.AppID)" } else { Start-Process -FilePath $s.path }
      $relaunched += $s.name
    } catch { }
  }
  # Styling tools change look with context (e.g. TranslucentTB goes clear on the desktop),
  # so only a move from a custom color to a stock one counts as "lost styling".
  # Without a styling tool there is nothing to lose (shades can drift with the accent color).
  $changed = (@($stylers).Count -gt 0 -and $colorBefore -ge 0 -and $colorAfter -ge 0 -and
              -not (Test-StockColor $colorBefore) -and (Test-StockColor $colorAfter))
  $script:RestartReport = [pscustomobject]@{
    taskbarColorChanged = $changed
    before = $(if ($colorBefore -ge 0) { '{0:X6}' -f $colorBefore } else { $null })   # null = taskbar not readable (e.g. locked screen)
    after = $(if ($colorAfter -ge 0) { '{0:X6}' -f $colorAfter } else { $null })
    relaunched = $relaunched
    hint = $(if ($changed -and -not $relaunched.Count) { 'Taskbar look changed after the explorer restart; a taskbar styling tool may have hit a failsafe. Restart it, or use -RestartCooldown <sec> for batches.' } else { $null })
  }
}

# ---------- commands ----------
function Set-AppIcon($info, [string]$ico, [int]$idx) {
  $ico = (Resolve-Path -LiteralPath $ico).Path
  $state = Get-State
  $updated = @(); $skipped = @(); $targets = @()
  foreach ($l in @($info.startMenu) + @($info.pinned)) {
    if (-not $l) { continue }
    if (-not (Test-Writable $l)) { $skipped += $l; continue }
    Remember-Original $state $l
    $targets += $l
  }
  # Originals are on disk before any shortcut changes, so restore works even if we stop halfway.
  Save-State $state
  foreach ($l in $targets) {
    [Iconwright.Lnk]::SetIcon($l, $ico, $idx)
    [Iconwright.Refresh]::Item($l)
    $updated += $l
  }
  # Running windows pick up the Start Menu shortcut's icon live; pinned-but-closed
  # buttons re-read their shortcut on the next explorer start. Keep the pin cache in sync.
  foreach ($p in @($info.pinned)) { if ($p) { [void][Iconwright.Taskband]::Sync($p) } }
  [pscustomobject]@{ updated = $updated; skipped = $skipped }
}

# Prepares the pinned shortcut for one app; returns {path, appId}, or $null if already pinned.
function New-PinShortcut($info) {
  if (@($info.pinned).Count) { return $null }
  $dst = Join-Path $PinnedDir ($info.name + '.lnk')
  if ($info.store) {
    $exe = Join-Path (KF Windows) 'explorer.exe'
    [Iconwright.Lnk]::Save($dst, $exe, "shell:AppsFolder\$($info.appId)", $null, $null, 0, $info.appId, $info.name)
  } elseif ($info.startMenu.Count) {
    Copy-Item -LiteralPath $info.startMenu[0] -Destination $dst -Force
  } elseif ($info.target) {
    [Iconwright.Lnk]::Save($dst, $info.target, $null, (Split-Path $info.target), $null, 0, $info.explicitId, $info.name)
  } else { throw "Can't build a shortcut for '$($info.name)'" }
  if ($Icon) { [Iconwright.Lnk]::SetIcon($dst, (Resolve-Path -LiteralPath $Icon).Path, $IconIndex) }
  # The pin entry must carry the AppID explorer uses for the app's windows.
  [pscustomobject]@{ path = $dst; appId = $(if ($info.explicitId) { $info.explicitId } else { $info.appId }) }
}

function Cmd-Pin($infos) {
  $todo = @($infos | Where-Object { -not @($_.pinned).Count })
  # Shortcuts are written inside Invoke-PinChange, after the backup, so a failure removes them again.
  $script:NewPins = @()
  if ($todo.Count) {
    Invoke-PinChange { $script:NewPins = @(foreach ($i in $todo) { New-PinShortcut $i }) } {
      foreach ($d in $script:NewPins) { [Iconwright.Taskband]::Append($d.path, $d.appId) }
    }
  }
  $new = $script:NewPins
  $list = [Iconwright.Taskband]::List()
  [pscustomobject]@{
    ok = @($new | Where-Object { $list -notcontains $_.path }).Count -eq 0
    pinned = @($new | ForEach-Object { $_.path }); already = @($infos | Where-Object { @($_.pinned).Count } | ForEach-Object { $_.name })
    restarted = [bool]($new.Count -and -not $NoRestart)
    explorer = $script:RestartReport
  }
}

# Moves the given apps' pins (in the given order) to index $pos; others keep their order.
function Cmd-Reorder($infos, [int]$pos) {
  $list = @([Iconwright.Taskband]::List())
  $move = @(foreach ($i in $infos) {
    if (-not @($i.pinned).Count) { Fail "'$($i.name)' is not pinned" }
    foreach ($p in $i.pinned) { if ($list -contains $p) { $p } }
  })
  $rest = @($list | Where-Object { $move -notcontains $_ })
  if ($pos -lt 0) { $pos = $rest.Count + 1 + $pos }
  $pos = [math]::Max(0, [math]::Min($pos, $rest.Count))
  $new = @($rest | Select-Object -First $pos) + $move + @($rest | Select-Object -Skip $pos)
  if (($new -join '|') -eq ($list -join '|')) { return [pscustomobject]@{ ok = $true; changed = $false; order = Get-PinNames $new } }
  Invoke-PinChange $null { [Iconwright.Taskband]::SetOrder([string[]]$new) }
  $now = @([Iconwright.Taskband]::List())
  [pscustomobject]@{ ok = (($now -join '|') -eq ($new -join '|')); changed = $true; order = Get-PinNames $now; explorer = $script:RestartReport }
}
function Get-PinNames($paths) { @($paths | ForEach-Object { [IO.Path]::GetFileNameWithoutExtension($_) }) }

function Cmd-Unpin($infos) {
  $pins = @($infos | ForEach-Object { @($_.pinned) } | Where-Object { $_ })
  if (-not $pins.Count) { return [pscustomobject]@{ ok = $true; already = $true } }
  Invoke-PinChange $null { foreach ($p in $pins) { [void][Iconwright.Taskband]::Remove($p) } }
  foreach ($p in $pins) { Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue }
  [pscustomobject]@{ ok = $true; removed = $pins; explorer = $script:RestartReport }
}

function Cmd-Restore($info) {
  $state = Get-State; $restored = @()
  foreach ($l in @($info.startMenu) + @($info.pinned)) {
    if (-not $l) { continue }
    $orig = $state.originals.PSObject.Properties[$l]
    if (-not $orig) { continue }
    $v = [string]$orig.Value
    if ($v -match '^(.*),(-?\d+)$') { [Iconwright.Lnk]::SetIcon($l, $Matches[1], [int]$Matches[2]) }
    else { [Iconwright.Lnk]::SetIcon($l, '', 0) }
    [Iconwright.Refresh]::Item($l)
    $state.originals.PSObject.Properties.Remove($l)
    $restored += $l
  }
  foreach ($p in @($info.pinned)) { if ($p) { [void][Iconwright.Taskband]::Sync($p) } }
  Save-State $state
  [pscustomobject]@{ restored = $restored }
}

# Puts the pin list back from a backup ('original' = before iconwright's first change,
# 'last' = before the most recent change). Restarts explorer.
function Cmd-RestorePins([string]$from) {
  if (-not $from) { $from = 'last' }
  if ($from -notin 'original', 'last') { Fail "restore-pins: -Value must be 'original' or 'last'" }
  $b = Get-TaskbandBackup $from
  if (-not $b) { Fail "No '$from' pin-list backup in $BackupDir (iconwright hasn't changed the pin list yet)." }
  # Work from a copy: the restart below takes a fresh 'last' backup, replacing this one.
  $work = Join-Path ([IO.Path]::GetTempPath()) ("iconwright-restore-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force $work | Out-Null
  $reg = Join-Path $work 'taskband.reg'; Copy-Item -LiteralPath $b.reg -Destination $reg
  $folder = Join-Path $work 'TaskBar'
  if (Test-Path -LiteralPath $b.folder) { Copy-Item -LiteralPath $b.folder -Destination $folder -Recurse }
  $before = Get-PinNames @([Iconwright.Taskband]::List())
  # Shortcuts first (the pin list points at them), then the registry values.
  Invoke-PinChange {
    if (Test-Path -LiteralPath $folder) {
      New-Item -ItemType Directory -Force $PinnedDir | Out-Null
      Get-ChildItem -LiteralPath $folder -Force | Copy-Item -Destination $PinnedDir -Recurse -Force
    }
  } {
    if ((Invoke-Reg @('import', $reg)) -ne 0) { throw "reg import failed for $reg" }
  }
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  [pscustomobject]@{ ok = $true; from = $from; before = $before; after = Get-PinNames @([Iconwright.Taskband]::List()); explorer = $script:RestartReport }
}

# Puts back every icon iconwright changed (apps and desktop items) and forgets them.
function Cmd-RestoreAll {
  $state = Get-State
  $done = @(); $gone = @(); $pinnedTouched = $false
  $pins = @([Iconwright.Taskband]::List())
  foreach ($key in @($state.originals.PSObject.Properties | ForEach-Object Name)) {
    if ($key -like 'clsid:*') {
      $name = @($SystemIcons.Keys | Where-Object { "clsid:$($SystemIcons[$_])" -eq $key })[0]
      if ($name) { [void](Restore-DesktopIcon $name); $done += $name; $state = Get-State; continue }
    }
    if (-not (Test-Path -LiteralPath $key)) {
      $state.originals.PSObject.Properties.Remove($key); Save-State $state; $gone += $key; continue
    }
    if ($key -like '*.lnk' -and -not ($key.StartsWith([Environment]::GetFolderPath('Desktop')) -or $key.StartsWith([Environment]::GetFolderPath('CommonDesktopDirectory')))) {
      $v = [string]$state.originals.$key
      if ($v -match '^(.*),(-?\d+)$') { [Iconwright.Lnk]::SetIcon($key, $Matches[1], [int]$Matches[2]) } else { [Iconwright.Lnk]::SetIcon($key, '', 0) }
      [Iconwright.Refresh]::Item($key)
      if ($pins -contains $key) { [void][Iconwright.Taskband]::Sync($key); $pinnedTouched = $true }
      $state.originals.PSObject.Properties.Remove($key); Save-State $state
    } else {
      [void](Restore-DesktopIcon $key); $state = Get-State
    }
    $done += $key
  }
  [pscustomobject]@{ restored = $done; forgotten = $gone; needsRefresh = $pinnedTouched }
}

# Read-only health check: what iconwright needs and what it found.
function Cmd-Doctor {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
  $checks = [ordered]@{}
  $checks.windows = [pscustomobject]@{ ok = [Environment]::OSVersion.Version.Major -ge 10; detail = "$($os.Caption) build $([Environment]::OSVersion.Version.Build)" }
  $checks.powershell = [pscustomobject]@{ ok = $PSVersionTable.PSVersion.Major -ge 5; detail = "$($PSVersionTable.PSVersion)" }
  $checks.interop = [pscustomobject]@{ ok = [bool]('Iconwright.Taskband' -as [type]); detail = 'C# helper compiled and loaded' }
  $startOk = $true; try { [void](Get-StartApps | Select-Object -First 1) } catch { $startOk = $false }
  $checks.startApps = [pscustomobject]@{ ok = $startOk; detail = 'Get-StartApps (app lookup)' }
  $native = $false; try { $native = (Invoke-Reg @('query', 'HKCU\Console')) -eq 0 } catch { }
  $checks.nativeCommands = [pscustomobject]@{ ok = $native; detail = 'can run reg.exe (needed for pin-list backups)' }
  $n = [Iconwright.Taskband]::Count()
  $checks.pinList = [pscustomobject]@{ ok = [Iconwright.Taskband]::Valid(); detail = "$n pinned item(s); format recognized = $([Iconwright.Taskband]::Valid())" }
  $checks.pinPrefix = [pscustomobject]@{ ok = $n -gt 0; detail = $(if ($n) { 'at least one existing pin to copy from' } else { 'no pins yet: pin any app once by hand, then iconwright can pin' }) }
  $checks.explorer = [pscustomobject]@{ ok = [Iconwright.TaskbarColor]::TrayPresent(); detail = 'taskbar window present' }
  $desk = $true; try { [void][Iconwright.Desktop]::GetIconSize() } catch { $desk = $false }
  $checks.desktop = [pscustomobject]@{ ok = $desk; detail = 'desktop icon view reachable' }
  $shellMods = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^(StartAllBackCfg|StartAllBack.*|ExplorerPatcher.*|ep_.*|Start11.*|TranslucentTB|TaskbarX|RoundedTB|Windhawk)$' } | ForEach-Object ProcessName | Sort-Object -Unique)
  $sab = Test-Path -LiteralPath 'HKCU:\Software\StartIsBack'
  $ep = Test-Path -LiteralPath 'HKCU:\Software\ExplorerPatcher'
  [pscustomobject]@{
    ok = -not @($checks.Values | Where-Object { -not $_.ok }).Count
    checks = [pscustomobject]$checks
    taskbarMods = [pscustomobject]@{ running = $shellMods; startAllBack = $sab; explorerPatcher = $ep }
    elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    dataDir = $Home_
    backups = [pscustomobject]@{ original = [bool](Get-TaskbandBackup 'original'); last = [bool](Get-TaskbandBackup 'last') }
    savedIcons = @((Get-State).originals.PSObject.Properties).Count
  }
}

# One request at a time across all iconwright processes (CLI, MCP worker): pin-list writes and
# explorer restarts must never overlap, and reads must not see a half-restarted shell.
# Only 'apps' (Start menu lookup) and 'help' skip the lock.
$script:Lock = New-Object Threading.Mutex($false, 'Local\iconwright-change')
$script:Locked = $false
function Enter-Lock([string]$cmd) {
  if ($cmd -in 'apps', 'help') { return }
  $got = $false
  try { $got = $script:Lock.WaitOne([TimeSpan]::FromSeconds(120)) } catch [Threading.AbandonedMutexException] { $got = $true }
  if (-not $got) { Fail 'Another iconwright change is still running; try again when it finishes.' }
  $script:Locked = $true
}
function Exit-Lock {
  if ($script:Locked) { $script:Locked = $false; try { $script:Lock.ReleaseMutex() } catch { } }
}

# Where an app's own icon comes from: the icon it had before iconwright changed it (or its
# current one), else the exe, else what the shell shows (Store apps). {file,index} or {shell}.
function Get-AppIconSource($info) {
  $state = Get-State
  $links = @(@($info.pinned) + @($info.startMenu) | Where-Object { $_ })   # pinned first: what the taskbar shows
  $loc = $null
  foreach ($l in $links) { $o = $state.originals.PSObject.Properties[$l]; if ($o) { $loc = [string]$o.Value; break } }
  if ($null -eq $loc) { foreach ($l in $links) { if (Test-Path -LiteralPath $l) { $loc = [Iconwright.Lnk]::GetIcon($l); break } } }
  if ($loc -match '^(.*),(-?\d+)$' -and $Matches[1]) {
    $f = [Environment]::ExpandEnvironmentVariables($Matches[1])
    if (Test-Path -LiteralPath $f) { return @{ file = $f; index = [int]$Matches[2] } }
  }
  if (-not $info.store -and $info.target -and (Test-Path -LiteralPath $info.target)) { return @{ file = $info.target; index = 0 } }
  @{ shell = "shell:AppsFolder\$($info.appId)" }
}

function Invoke-Request {
switch -Wildcard ($Command.ToLower()) {
  'app-icon-image' {
    # Saves each app's own icon as an image to recolor; .ico files are returned as they are.
    $dir = if ($File) { $File } else { Join-Path $Home_ 'cache\app-icons' }
    New-Item -ItemType Directory -Force $dir | Out-Null
    Out-Json @(foreach ($a in @($App)) {
      try {
        $info = Resolve-App $a; $src = Get-AppIconSource $info
        if ($src.file -and $src.file -match '\.ico$') { $img = $src.file }
        else {
          $img = Join-Path $dir (($info.name -replace '[^\w.-]+', '-') + '.png')
          if ($src.file) { [void][Iconwright.IconImage]::FromFile($src.file, $src.index, 256, $img) }
          else { [void][Iconwright.IconImage]::FromShellItem($src.shell, 256, $img) }
        }
        [pscustomobject]@{ app = $info.name; image = $img }
      } catch { [pscustomobject]@{ app = $a; error = $_.Exception.Message } }
    })
  }
  'set-icons' {
    # -Value: JSON list of {app, icon, index?}. One request for many apps; failures are per app.
    if (-not $Value) { Fail 'set-icons needs -Value <JSON list of {app, icon}>' }
    # PowerShell 5.1 returns a JSON array as one object; enumerate it.
    $plan = @(($Value | ConvertFrom-Json) | ForEach-Object { $_ })
    $results = @(foreach ($p in $plan) {
      try {
        $info = Resolve-App ([string]$p.app)
        $r = Set-AppIcon $info ([string]$p.icon) $(if ($p.PSObject.Properties['index']) { [int]$p.index } else { 0 })
        [pscustomobject]@{ app = $info.name; updated = @($r.updated).Count; skipped = @($r.skipped)
          needsRefresh = [bool](@($info.pinned).Count -and -not $info.explicitId) }
      } catch { [pscustomobject]@{ app = [string]$p.app; error = $_.Exception.Message } }
    })
    Out-Json ([pscustomobject]@{ results = $results
      needsRefresh = [bool]@($results | Where-Object { $_.PSObject.Properties['needsRefresh'] -and $_.needsRefresh }).Count })
  }
  'doctor' { Out-Json (Cmd-Doctor) }
  'capture' {
    $what = if ($Value) { $Value.ToLower() } else { 'taskbar' }
    if ($what -notin 'taskbar', 'desktop', 'screen') { Fail "capture: -Value must be taskbar, desktop or screen" }
    $out = if ($File) { $File } else { Join-Path (Join-Path $Home_ 'captures') "$what.png" }
    New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
    if (Get-Process LogonUI -ErrorAction SilentlyContinue) { Fail "Can't take a screenshot while the screen is locked or the sign-in screen is showing." }
    $size = switch ($what) { 'taskbar' { [Iconwright.Capture]::Taskbar($out, $MaxWidth) } 'desktop' { [Iconwright.Capture]::Desktop($out, $MaxWidth) } default { [Iconwright.Capture]::Screen($out, $MaxWidth) } }
    Out-Json ([pscustomobject]@{ path = $out; size = $size })
  }
  'restore-pins' { Out-Json (Cmd-RestorePins $Value) }
  'restore-all' { Out-Json (Cmd-RestoreAll) }
  'desktop-*' { Invoke-DesktopCommand $Command.Substring(8).ToLower() }
  'reorder' { Out-Json (Cmd-Reorder @($App | ForEach-Object { Resolve-App $_ }) $Position) }
  'apps' {
    Out-Json @(Find-Apps $Query | Select-Object -First 50 | ForEach-Object { [pscustomobject]@{ name = $_.Name; appId = $_.AppID } })
  }
  'info' { Out-Json @($App | ForEach-Object { Resolve-App $_ }) }
  'set-icon' {
    if (-not $Icon) { Fail 'Missing -Icon <path.ico>' }
    if (@($App).Count -ne 1) { Fail 'set-icon takes exactly one -App' }
    $info = Resolve-App $App[0]
    $r = Set-AppIcon $info $Icon $IconIndex
    $needs = [bool](@($info.pinned).Count -and -not $info.explicitId)
    Out-Json ([pscustomobject]@{ app = $info.name; icon = $Icon; updated = $r.updated; skipped = $r.skipped;
      needsRefresh = $needs;
      note = $(if ($r.skipped.Count) { 'Some shortcuts need admin (all-users Start Menu); rerun elevated to change them.' } else { $null }) })
  }
  'pin' {
    if ($Icon -and @($App).Count -ne 1) { Fail '-Icon with pin takes exactly one -App' }
    $r = Cmd-Pin @($App | ForEach-Object { Resolve-App $_ })
    if ($Icon) { [void](Set-AppIcon (Resolve-App $App[0]) $Icon $IconIndex) }
    Out-Json $r
  }
  'unpin' { Out-Json (Cmd-Unpin @($App | ForEach-Object { Resolve-App $_ })) }
  'restore' { Out-Json @($App | ForEach-Object { Cmd-Restore (Resolve-App $_) }) }
  'refresh' {
    # Re-reads pinned shortcuts (needed for apps without an AppUserModelID).
    foreach ($p in [Iconwright.Taskband]::List()) { if ($p -and (Test-Path -LiteralPath $p)) { [void][Iconwright.Taskband]::Sync($p) } }
    Invoke-PinChange $null {} -NoBackup
    Out-Json ([pscustomobject]@{ ok = $true; explorer = $script:RestartReport })
  }
  'status' {
    # Pins usually live in the pinned folder; only paths elsewhere are spelled out.
    Out-Json ([pscustomobject]@{ folder = $PinnedDir; pins = @([Iconwright.Taskband]::List() | ForEach-Object {
      $ok = $_ -and (Test-Path -LiteralPath $_)
      $o = [ordered]@{ name = $(if ($_) { [IO.Path]::GetFileNameWithoutExtension($_) } else { '(unknown)' }) }
      if ($_ -and (Split-Path $_) -ne $PinnedDir) { $o.path = $_ }
      $ic = if ($ok) { [Iconwright.Lnk]::GetIcon($_) } else { $null }
      if ($ic -and $ic -ne ',0') { $o.icon = $ic }
      [pscustomobject]$o
    }) })
  }
  default {
    Out-Json 'Commands: apps | info | set-icon | set-icons | app-icon-image | pin | unpin | reorder | restore | restore-all | restore-pins | refresh | status | doctor | capture | desktop-<list|move|arrange|size|options|system|set-icon|restore|save|load>. Use the Node CLI (iconwright help) for documented usage.'
  }
}
}

# Long-lived mode for the MCP server: one JSON request per stdin line, one JSON reply per
# stdout line ({id, ok, result} or {id, ok:false, error}). Saves ~1-2 s of PowerShell startup
# per call. Parameters are reset to their defaults before every request.
function Start-Worker {
  $utf8 = New-Object Text.UTF8Encoding($false)
  [Console]::InputEncoding = $utf8; [Console]::OutputEncoding = $utf8
  $defaults = [ordered]@{ App = $null; Query = $null; Icon = $null; IconIndex = 0; NoRestart = $false
    RestartCooldown = $(if ($env:ICONWRIGHT_RESTART_COOLDOWN) { [int]$env:ICONWRIGHT_RESTART_COOLDOWN } else { 0 })
    Position = 0; Item = $null; X = 0; Y = 0; Value = $null; File = $null; By = $null; Corner = $null; Flow = $null
    AutoArrange = $null; SnapToGrid = $null; ShowIcons = $null; MaxWidth = 1600; Monitor = 0 }
  [Console]::Out.WriteLine('{"ready":true}'); [Console]::Out.Flush()
  while ($null -ne ($line = [Console]::In.ReadLine())) {
    if (-not $line.Trim()) { continue }
    $id = 0
    try {
      $req = $line | ConvertFrom-Json
      $id = [long]$req.id
      foreach ($k in $defaults.Keys) { Set-Variable -Scope Script -Name $k -Value $defaults[$k] }
      if ($req.params) {
        foreach ($p in $req.params.PSObject.Properties) {
          if (-not $defaults.Contains($p.Name)) { throw "unknown parameter $($p.Name)" }
          Set-Variable -Scope Script -Name $p.Name -Value $p.Value
        }
      }
      $script:Command = [string]$req.command
      $script:RestartReport = $null; $script:StartAppsCache = $null
      Enter-Lock $script:Command
      $out = @(Invoke-Request)
      $json = if ($out.Count) { [string]$out[-1] } else { 'null' }
      $reply = '{"id":' + $id + ',"ok":true,"result":' + $json + '}'
    } catch {
      $reply = ConvertTo-Json -Compress -InputObject ([ordered]@{ id = $id; ok = $false; error = $_.Exception.Message })
    } finally { Exit-Lock }
    [Console]::Out.WriteLine($reply); [Console]::Out.Flush()
  }
}

Import-Interop
. (Join-Path $PSScriptRoot 'desktop.ps1')
if ($Command -eq '__worker') { Start-Worker; exit 0 }

[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
try {
  Enter-Lock $Command
  $out = @(Invoke-Request)
  if ($out.Count) { $out[-1] }   # the JSON line (anything else would be stray output)
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
} finally { Exit-Lock }
