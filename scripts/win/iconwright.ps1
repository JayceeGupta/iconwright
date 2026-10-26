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
  [string]$AutoArrange, [string]$SnapToGrid, [string]$ShowIcons
)
$ErrorActionPreference = 'Stop'
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
function Fail([string]$msg) { [Console]::Error.WriteLine($msg); exit 1 }

# ---------- interop (compiled once per source hash, then cached) ----------
function Import-Interop {
  if ('Iconwright.Taskband' -as [type]) { return }
  $src = Join-Path $PSScriptRoot 'Iconwright.Win.cs'
  $hash = (Get-FileHash $src -Algorithm SHA256).Hash.Substring(0, 12)
  $dll = Join-Path $Home_ "bin\Iconwright.Win.$hash.dll"
  if (-not (Test-Path -LiteralPath $dll)) {
    New-Item -ItemType Directory -Force (Split-Path $dll) | Out-Null
    Add-Type -Path $src -OutputAssembly $dll -OutputType Library
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

function Find-Apps([string]$q) {
  $apps = Get-StartApps
  if ($q) {
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
  if ($m.Count -eq 0) { Fail "No Start menu app matches '$name'. Try: iconwright apps <text>" }
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

# Pinned taskbar shortcuts belonging to the app (match by AppID, then by target exe).
function Get-PinnedFor($a, [string]$target, [string]$appId) {
  foreach ($p in [Iconwright.Taskband]::List()) {
    if (-not $p -or -not $p.EndsWith('.lnk') -or -not (Test-Path -LiteralPath $p)) { continue }
    $id = Get-LnkAppId $p
    if (($appId -and $id -eq $appId) -or
        ([IO.Path]::GetFileNameWithoutExtension($p) -eq $a.Name) -or
        ($target -and -not $id -and ([Iconwright.Lnk]::GetTarget($p) -eq $target))) { $p }
  }
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
  try { $null = & reg.exe @argv 2>&1 } finally { $ErrorActionPreference = $eap }
  $LASTEXITCODE
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
    if ((Get-Process explorer -ErrorAction SilentlyContinue) -and [Iconwright.TaskbarColor]::TrayPresent()) { return $true }
    Start-Sleep -Milliseconds 250
  }
  $false
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

function Invoke-WithExplorerStopped([scriptblock]$action) {
  $stamp = Join-Path $Home_ 'last-explorer-restart'
  if ($RestartCooldown -gt 0 -and (Test-Path -LiteralPath $stamp)) {
    $wait = $RestartCooldown - ((Get-Date) - (Get-Item -LiteralPath $stamp).LastWriteTime).TotalSeconds
    if ($wait -gt 0) { Start-Sleep -Seconds ([math]::Ceiling($wait)) }
  }
  $colorBefore = [Iconwright.TaskbarColor]::Sample()
  $stylers = Get-StylerProcesses
  New-Item -ItemType Directory -Force $Home_ | Out-Null
  Set-Content -LiteralPath $stamp -Value (Get-Date -Format o)
  Backup-Taskband
  $snapshot = Get-TaskbandValues
  try { [Iconwright.Desktop]::SaveState() } catch { }   # a forced kill skips explorer's own save
  Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
  Wait-Process -Name explorer -Timeout 5 -ErrorAction SilentlyContinue
  $failure = $null
  try { & $action }
  catch {
    # Put the pin list back exactly as it was before bringing explorer back.
    $failure = $_.Exception.Message
    try { Set-TaskbandValues $snapshot } catch { $failure += " (rollback also failed: $($_.Exception.Message); restore with: iconwright restore-pins --from last)" }
  }
  finally {
    # Windows normally restarts the shell by itself; start it only if that didn't happen,
    # since a second explorer.exe would just open a File Explorer window.
    if (-not (Wait-Taskbar 8)) {
      if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }
      [void](Wait-Taskbar 20)
    }
  }
  Complete-TaskbandBackup (-not $failure)
  if ($failure) { Fail "Taskbar change failed and was rolled back: $failure" }
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
      if ($sa) { Start-Process explorer.exe "shell:AppsFolder\$($sa.AppID)" } else { Start-Process -FilePath $s.path }
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
  $updated = @(); $skipped = @()
  foreach ($l in @($info.startMenu) + @($info.pinned)) {
    if (-not $l) { continue }
    if (-not (Test-Writable $l)) { $skipped += $l; continue }
    Remember-Original $state $l
    [Iconwright.Lnk]::SetIcon($l, $ico, $idx)
    [Iconwright.Refresh]::Item($l)
    $updated += $l
  }
  Save-State $state
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
  } else { Fail "Can't build a shortcut for '$($info.name)'" }
  if ($Icon) { [Iconwright.Lnk]::SetIcon($dst, (Resolve-Path -LiteralPath $Icon).Path, $IconIndex) }
  # The pin entry must carry the AppID explorer uses for the app's windows.
  [pscustomobject]@{ path = $dst; appId = $(if ($info.explicitId) { $info.explicitId } else { $info.appId }) }
}

function Cmd-Pin($infos) {
  $new = @(foreach ($i in $infos) { $d = New-PinShortcut $i; if ($d) { $d } })
  if ($new.Count) {
    $apply = { foreach ($d in $new) { [Iconwright.Taskband]::Append($d.path, $d.appId) } }
    if ($NoRestart) { & $apply } else { Invoke-WithExplorerStopped $apply }
  }
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
  $apply = { [Iconwright.Taskband]::SetOrder([string[]]$new) }
  if ($NoRestart) { & $apply } else { Invoke-WithExplorerStopped $apply }
  $now = @([Iconwright.Taskband]::List())
  [pscustomobject]@{ ok = (($now -join '|') -eq ($new -join '|')); changed = $true; order = Get-PinNames $now; explorer = $script:RestartReport }
}
function Get-PinNames($paths) { @($paths | ForEach-Object { [IO.Path]::GetFileNameWithoutExtension($_) }) }

function Cmd-Unpin($infos) {
  $pins = @($infos | ForEach-Object { @($_.pinned) } | Where-Object { $_ })
  if (-not $pins.Count) { return [pscustomobject]@{ ok = $true; already = $true } }
  $apply = { foreach ($p in $pins) { [void][Iconwright.Taskband]::Remove($p) } }
  if ($NoRestart) { & $apply } else { Invoke-WithExplorerStopped $apply }
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
  Invoke-WithExplorerStopped {
    # Shortcuts first (the pin list points at them), then the registry values.
    if (Test-Path -LiteralPath $folder) {
      New-Item -ItemType Directory -Force $PinnedDir | Out-Null
      Get-ChildItem -LiteralPath $folder -Force | Copy-Item -Destination $PinnedDir -Recurse -Force
    }
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

# Changes run one at a time: two explorer restarts or pin-list writes must never overlap.
$ReadOnly = @('apps', 'info', 'status', 'doctor', 'desktop-list', 'help')
$script:Lock = $null
if ($ReadOnly -notcontains $Command.ToLower()) {
  $script:Lock = New-Object Threading.Mutex($false, 'Local\iconwright-change')
  $got = $false
  try { $got = $script:Lock.WaitOne([TimeSpan]::FromSeconds(180)) } catch [Threading.AbandonedMutexException] { $got = $true }
  if (-not $got) { Fail 'Another iconwright change is still running; try again when it finishes.' }
}

Import-Interop
. (Join-Path $PSScriptRoot 'desktop.ps1')
switch -Wildcard ($Command.ToLower()) {
  'doctor' { Out-Json (Cmd-Doctor) }
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
    Invoke-WithExplorerStopped {}
    Out-Json ([pscustomobject]@{ ok = $true; explorer = $script:RestartReport })
  }
  'status' {
    Out-Json @([Iconwright.Taskband]::List() | ForEach-Object {
      $ok = $_ -and (Test-Path -LiteralPath $_)
      [pscustomobject]@{ path = $_; icon = $(if ($ok) { [Iconwright.Lnk]::GetIcon($_) } else { $null }) }
    })
  }
  default {
    'Commands: apps | info | set-icon | pin | unpin | reorder | restore | restore-all | restore-pins | refresh | status | doctor | desktop-<list|move|arrange|size|options|system|set-icon|restore|save|load>. Use the Node CLI (iconwright help) for documented usage.'
  }
}
