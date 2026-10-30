# Desktop icon commands for iconwright.ps1 (dot-sourced; uses its helpers: Out-Json, Fail,
# Get-State, Save-State, Remember-Original, KF). All changes apply live, no explorer restart.

# Desktop "system" icons: name -> CLSID (HKCU ...\HideDesktopIcons\NewStartPanel + per-user DefaultIcon).
$SystemIcons = [ordered]@{
  'this-pc'       = '{20D04FE0-3AEA-1069-A2D8-08002B30309D}'
  'recycle-bin'   = '{645FF040-5081-101B-9F08-00AA002F954E}'
  'user-files'    = '{59031a47-3f72-44a7-89c5-5595fe6b30ee}'
  'network'       = '{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}'
  'control-panel' = '{5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0}'
}
$HideKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel'

function Get-SystemIconKey([string]$name) {
  $k = ($name -replace '\s+', '-').ToLower()
  $alias = @{ 'computer' = 'this-pc'; 'my-computer' = 'this-pc'; 'recycle'= 'recycle-bin'; 'bin' = 'recycle-bin'; 'trash' = 'recycle-bin' }
  if ($alias.ContainsKey($k)) { $k = $alias[$k] }
  if ($SystemIcons.Contains($k)) { $k } else { $null }
}

# Live changes already applied; a failed save only risks losing them on an unclean Explorer exit.
function Save-Desktop {
  try { [Iconwright.Desktop]::SaveState() }
  catch { [Console]::Error.WriteLine("warning: desktop layout not saved yet (Explorer saves it on clean exit): $($_.Exception.Message)") }
}

function Get-DesktopItems {
  @([Iconwright.Desktop]::List() | ForEach-Object { [pscustomobject]@{ name = $_.name; path = $_.path; x = $_.x; y = $_.y } })
}

# Find one desktop item by display name or path (exact, then unique partial match).
function Find-DesktopItem([string]$key, $items) {
  if ($key -match '^[A-Za-z]:/') { $key = $key.Replace('/', '\') }
  $items = @($items | Where-Object { $_ })   # an empty desktop arrives as $null
  $m = @($items | Where-Object { $_.name -eq $key -or $_.path -eq $key })
  if (-not $m.Count) { $m = @($items | Where-Object { $_.name -like "*$key*" }) }
  if ($m.Count -eq 1) { return $m[0] }
  if (-not $m.Count) { Fail "No desktop item matches '$key'. See desktop_info (CLI: iconwright desktop list)." }
  Fail ("'$key' is ambiguous: " + (($m | ForEach-Object name) -join '; '))
}

function Get-DesktopInfo {
  $sp = [Iconwright.Desktop]::Spacing(); $wa = [Iconwright.Desktop]::WorkArea()
  $hidden = Get-ItemProperty -LiteralPath $HideKey -ErrorAction SilentlyContinue
  [pscustomobject]@{
    iconSize = [Iconwright.Desktop]::GetIconSize()
    autoArrange = [Iconwright.Desktop]::AutoArrange; snapToGrid = [Iconwright.Desktop]::SnapToGrid
    iconsVisible = [Iconwright.Desktop]::IconsVisible
    grid = [pscustomobject]@{ x = $sp.X; y = $sp.Y }
    workArea = [pscustomobject]@{ left = $wa.L; top = $wa.T; right = $wa.R; bottom = $wa.B }
    monitors = @([Iconwright.Desktop]::Monitors() | ForEach-Object { [pscustomobject]@{ left = $_.L; top = $_.T; right = $_.R; bottom = $_.B } })
    systemIcons = @(foreach ($k in $SystemIcons.Keys) {
      $v = if ($hidden) { $hidden.PSObject.Properties[$SystemIcons[$k]] } else { $null }
      [pscustomobject]@{ name = $k; shown = -not ($v -and $v.Value -eq 1) } })
    items = @(Get-DesktopItems)
  }
}

# Lays items out on one monitor's grid (0 = primary). Order: explicit -Item list first, then the
# other items already on that monitor, sorted by -By. Items on other monitors are left alone.
function Invoke-DesktopArrange([string[]]$first, [string]$by, [string]$corner, [string]$flow, [int]$monitor) {
  $mons = @([Iconwright.Desktop]::Monitors())
  if ($monitor -lt 0 -or $monitor -ge $mons.Count) { Fail "Monitor $monitor doesn't exist; this PC has $($mons.Count) (0 = primary)." }
  $wa = $mons[$monitor]
  $onMonitor = { param($it) $mons.Count -eq 1 -or ($it.x -ge $wa.L -and $it.x -lt $wa.R -and $it.y -ge $wa.T -and $it.y -lt $wa.B) }
  $items = @(Get-DesktopItems)
  $ordered = New-Object System.Collections.ArrayList
  foreach ($k in @($first | Where-Object { $_ })) {
    $it = Find-DesktopItem $k $items
    if (-not (& $onMonitor $it)) { Fail "'$($it.name)' is on another monitor; arrange only moves icons on monitor $monitor. Use desktop move to bring it over first." }
    if ($ordered -notcontains $it) { [void]$ordered.Add($it) }
  }
  $rest = @($items | Where-Object { $ordered -notcontains $_ -and (& $onMonitor $_) })
  switch ($by) {
    'type'  { $rest = @($rest | Sort-Object { [IO.Path]::GetExtension($_.path) }, name) }
    'none'  { $rest = @($rest | Sort-Object y, x) }   # keep current visual order
    default { $rest = @($rest | Sort-Object name) }
  }
  foreach ($r in $rest) { [void]$ordered.Add($r) }

  $sp = [Iconwright.Desktop]::Spacing()
  $rows = [math]::Max(1, [math]::Floor(($wa.B - $wa.T) / $sp.Y))
  $cols = [math]::Max(1, [math]::Floor(($wa.R - $wa.L) / $sp.X))
  $keys = @(); $xs = @(); $ys = @(); $i = 0
  foreach ($it in $ordered) {
    if ($flow -eq 'rows') { $c = $i % $cols; $r = [math]::Floor($i / $cols) } else { $r = $i % $rows; $c = [math]::Floor($i / $rows) }
    $x = if ($corner -like '*right') { $wa.R - ($c + 1) * $sp.X } else { $wa.L + $c * $sp.X }
    $y = if ($corner -like 'bottom*') { $wa.B - ($r + 1) * $sp.Y } else { $wa.T + $r * $sp.Y }
    $keys += $it.path; $xs += [int]$x; $ys += [int]$y; $i++
  }
  $n = [Iconwright.Desktop]::Move([string[]]$keys, [int[]]$xs, [int[]]$ys)
  Save-Desktop
  [pscustomobject]@{ arranged = $n; items = @(Get-DesktopItems) }
}

# Text files (.url) are rewritten in the encoding they came in: BOM-marked UTF-8/UTF-16 stay
# that way, anything else is the system ANSI code page, which is what Windows writes.
function Read-TextFile([string]$path) {
  $bytes = [IO.File]::ReadAllBytes($path)
  $enc = [Text.Encoding]::Default
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { $enc = New-Object Text.UTF8Encoding($true) }
  elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { $enc = [Text.Encoding]::Unicode }
  elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) { $enc = [Text.Encoding]::BigEndianUnicode }
  $skip = $enc.GetPreamble().Length
  $text = $enc.GetString($bytes, $skip, $bytes.Length - $skip)
  $lines = [Collections.Generic.List[string]]@($text -split "`r?`n")
  if ($lines.Count -and $lines[$lines.Count - 1] -eq '') { $lines.RemoveAt($lines.Count - 1) }
  [pscustomobject]@{ lines = $lines; encoding = $enc }
}
function Write-TextFile([string]$path, $lines, $encoding) {
  [IO.File]::WriteAllText($path, ((@($lines) -join "`r`n") + "`r`n"), $encoding)
}
# Puts IconFile/IconIndex right after [InternetShortcut] (or removes them when $file is empty).
function Set-UrlIcon([string]$path, [string]$file, [int]$index) {
  $t = Read-TextFile $path
  $lines = [Collections.Generic.List[string]]@($t.lines | Where-Object { $_ -notlike 'IconFile=*' -and $_ -notlike 'IconIndex=*' })
  if ($file) {
    $at = $lines.IndexOf('[InternetShortcut]')
    if ($at -lt 0) { $lines.Insert(0, '[InternetShortcut]'); $at = 0 }
    $lines.Insert($at + 1, "IconIndex=$index"); $lines.Insert($at + 1, "IconFile=$file")
  }
  Write-TextFile $path $lines $t.encoding
}

function Set-DesktopIcon([string]$key, [string]$ico, [int]$idx) {
  $state = Get-State
  $sys = Get-SystemIconKey $key
  if ($sys) {
    $clsid = $SystemIcons[$sys]
    $k = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\CLSID\$clsid\DefaultIcon"
    $id = "clsid:$clsid"
    if (-not $state.originals.PSObject.Properties[$id]) {
      # Each value with its registry type, so restore recreates it exactly.
      $orig = @{}
      if (Test-Path -LiteralPath $k) {
        $item = Get-Item -LiteralPath $k
        # GetValueNames, not .Property: .Property calls the default value "(default)", a name
        # GetValue and GetValueKind don't know (its real name is ''). It's stored as "(default)",
        # since Windows PowerShell can't read a JSON key that is an empty string.
        foreach ($n in $item.GetValueNames()) { $orig[$(if ($n) { $n } else { '(default)' })] = @{ value = $item.GetValue($n, $null, 'DoNotExpandEnvironmentNames'); kind = [string]$item.GetValueKind($n) } }
      }
      $state.originals | Add-Member -NotePropertyName $id -NotePropertyValue ($orig | ConvertTo-Json -Compress -Depth 4)
      Save-State $state
    }
    New-Item -Path $k -Force | Out-Null
    $v = "$ico,$idx"
    Set-ItemProperty -LiteralPath $k -Name '(default)' -Value $v
    if ($sys -eq 'recycle-bin') { Set-ItemProperty -LiteralPath $k -Name 'empty' -Value $v; Set-ItemProperty -LiteralPath $k -Name 'full' -Value $v }
    [Iconwright.Refresh]::Associations()
    return [pscustomobject]@{ item = $sys; icon = $ico }
  }
  $it = Find-DesktopItem $key (Get-DesktopItems)
  $p = $it.path
  $isFolder = Test-Path -LiteralPath $p -PathType Container
  if ($p -notlike '*.lnk' -and $p -notlike '*.url' -and -not $isFolder) {
    Fail "'$($it.name)' is a regular file; its icon comes from its file type. Use a shortcut to it instead."
  }
  # Record the original first and save it, so restore works even if the change fails halfway.
  if (-not $state.originals.PSObject.Properties[$p]) {
    if ($p -like '*.lnk') { $orig = [Iconwright.Lnk]::GetIcon($p) }
    elseif ($p -like '*.url') {
      $lines = (Read-TextFile $p).lines
      $f = @($lines | Where-Object { $_ -like 'IconFile=*' } | ForEach-Object { $_ -replace '^IconFile=', '' } | Select-Object -First 1)
      $n = @($lines | Where-Object { $_ -like 'IconIndex=*' } | ForEach-Object { $_ -replace '^IconIndex=', '' } | Select-Object -First 1)
      $orig = if ($f.Count -and $f[0]) { "$($f[0]),$(if ($n.Count -and $n[0]) { $n[0] } else { 0 })" } else { '' }
    } else {
      # Folders: the whole desktop.ini (or its absence) plus both items' attributes.
      $ini = Join-Path $p 'desktop.ini'
      $o = [ordered]@{ dirAttr = [int](Get-Item -LiteralPath $p -Force).Attributes; ini = $null; iniAttr = $null }
      if (Test-Path -LiteralPath $ini) {
        $o.ini = [Convert]::ToBase64String([IO.File]::ReadAllBytes($ini))
        $o.iniAttr = [int](Get-Item -LiteralPath $ini -Force).Attributes
      }
      $orig = 'folder:' + (ConvertTo-Json -InputObject ([pscustomobject]$o) -Compress)
    }
    $state.originals | Add-Member -NotePropertyName $p -NotePropertyValue ([string]$orig)
    Save-State $state
  }
  if ($p -like '*.lnk') { [Iconwright.Lnk]::SetIcon($p, $ico, $idx) }
  elseif ($p -like '*.url') { Set-UrlIcon $p $ico $idx }
  else {
    $ini = Join-Path $p 'desktop.ini'
    if (Test-Path -LiteralPath $ini) { (Get-Item -LiteralPath $ini -Force).Attributes = 'Normal' }
    $body = if (Test-Path -LiteralPath $ini) { @(Get-Content -LiteralPath $ini | Where-Object { $_ -notlike 'IconResource=*' }) } else { @() }
    if ($body -notcontains '[.ShellClassInfo]') { $body = @('[.ShellClassInfo]') + $body }
    $i = [array]::IndexOf($body, '[.ShellClassInfo]'); $body = @($body[0..$i]) + @("IconResource=$ico,$idx") + @($body | Select-Object -Skip ($i + 1))
    Set-Content -LiteralPath $ini -Value $body -Encoding Unicode
    (Get-Item -LiteralPath $ini -Force).Attributes = 'Hidden, System'
    $d = Get-Item -LiteralPath $p -Force; $d.Attributes = $d.Attributes -bor [IO.FileAttributes]::ReadOnly
  }
  [Iconwright.Refresh]::Item($p)
  [pscustomobject]@{ item = $it.name; path = $p; icon = $ico }
}

function Restore-DesktopIcon([string]$key) {
  $state = Get-State
  $sys = Get-SystemIconKey $key
  if ($sys) {
    $clsid = $SystemIcons[$sys]; $id = "clsid:$clsid"
    $k = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\CLSID\$clsid\DefaultIcon"
    $o = $state.originals.PSObject.Properties[$id]
    if (-not $o) { return [pscustomobject]@{ restored = $false; item = $sys } }
    Remove-Item -LiteralPath $k -Recurse -Force -ErrorAction SilentlyContinue
    $vals = $o.Value | ConvertFrom-Json
    if ($vals -and @($vals.PSObject.Properties).Count) {
      New-Item -Path $k -Force | Out-Null
      foreach ($pp in $vals.PSObject.Properties) {
        $name = if ($pp.Name -eq '') { '(default)' } else { $pp.Name }
        # Older state stored plain strings (no type); those were REG_EXPAND_SZ.
        if ($pp.Value -is [pscustomobject] -and $pp.Value.PSObject.Properties['kind']) { $val = $pp.Value.value; $kind = $pp.Value.kind }
        else { $val = $pp.Value; $kind = 'ExpandString' }
        New-ItemProperty -LiteralPath $k -Name $name -Value $val -PropertyType $kind -Force | Out-Null
      }
    }
    $state.originals.PSObject.Properties.Remove($id); Save-State $state; [Iconwright.Refresh]::Associations()
    return [pscustomobject]@{ restored = $true; item = $sys }
  }
  $it = Find-DesktopItem $key (Get-DesktopItems); $p = $it.path
  $o = $state.originals.PSObject.Properties[$p]
  if (-not $o) { return [pscustomobject]@{ restored = $false; item = $it.name } }
  $v = [string]$o.Value
  if ($v.StartsWith('folder:')) {
    $f = $v.Substring(7) | ConvertFrom-Json
    $ini = Join-Path $p 'desktop.ini'
    if (Test-Path -LiteralPath $ini) { (Get-Item -LiteralPath $ini -Force).Attributes = 'Normal' }
    if ($f.ini) {
      [IO.File]::WriteAllBytes($ini, [Convert]::FromBase64String($f.ini))
      (Get-Item -LiteralPath $ini -Force).Attributes = [IO.FileAttributes][int]$f.iniAttr
    } else { Remove-Item -LiteralPath $ini -Force -ErrorAction SilentlyContinue }
    (Get-Item -LiteralPath $p -Force).Attributes = [IO.FileAttributes][int]$f.dirAttr
  } else {
    $file = ''; $n = 0
    if ($v -match '^(.*),(-?\d+)$') { $file = $Matches[1]; $n = [int]$Matches[2] } elseif ($v) { $file = $v }
    if ($p -like '*.lnk') { [Iconwright.Lnk]::SetIcon($p, $file, $n) }
    elseif ($p -like '*.url') { Set-UrlIcon $p $file $n }
    else {
      # Folder changed by an older version, which only kept the previous IconResource.
      $ini = Join-Path $p 'desktop.ini'
      if (Test-Path -LiteralPath $ini) {
        (Get-Item -LiteralPath $ini -Force).Attributes = 'Normal'
        $body = @(Get-Content -LiteralPath $ini | Where-Object { $_ -notlike 'IconResource=*' })
        if ($v) { $i = [array]::IndexOf($body, '[.ShellClassInfo]'); $body = @($body[0..$i]) + @("IconResource=$v") + @($body | Select-Object -Skip ($i + 1)) }
        Set-Content -LiteralPath $ini -Value $body -Encoding Unicode
        (Get-Item -LiteralPath $ini -Force).Attributes = 'Hidden, System'
      }
    }
  }
  $state.originals.PSObject.Properties.Remove($p); Save-State $state; [Iconwright.Refresh]::Item($p)
  [pscustomobject]@{ restored = $true; item = $it.name }
}

# Where a desktop item's own icon comes from: the icon it had before iconwright changed it,
# else what Explorer shows now. Returns {file,index,name}, {shell,name} or {fail}.
function Get-DesktopIconSource([string]$key) {
  $state = Get-State
  $sys = Get-SystemIconKey $key
  if ($sys) {
    $clsid = $SystemIcons[$sys]; $loc = $null
    $o = $state.originals.PSObject.Properties["clsid:$clsid"]
    if ($o) {
      $vals = $o.Value | ConvertFrom-Json
      $d = if ($vals) { $vals.PSObject.Properties['(default)'] } else { $null }
      if ($d) { $loc = if ($d.Value -is [pscustomobject]) { [string]$d.Value.value } else { [string]$d.Value } }
      if (-not $loc) {
        # No per-user icon before iconwright: Windows' own one. Explorer would show ours now.
        $m = Get-Item -LiteralPath "HKLM:\SOFTWARE\Classes\CLSID\$clsid\DefaultIcon" -ErrorAction SilentlyContinue
        if ($m) { $loc = [string]$m.GetValue('', $null, 'DoNotExpandEnvironmentNames') }
      }
    }
    if ($loc) { $r = Split-IconLocation $loc "::$clsid"; $r.name = $sys; return $r }
    return @{ shell = "::$clsid"; name = $sys }
  }
  $it = Find-DesktopItem $key (Get-DesktopItems); $p = $it.path
  $o = $state.originals.PSObject.Properties[$p]
  if (-not $o) { return @{ shell = $p; name = $it.name } }   # unchanged: exactly what the desktop shows
  $v = [string]$o.Value; $loc = $null
  if ($v.StartsWith('folder:')) {
    $f = $v.Substring(7) | ConvertFrom-Json
    if ($f.ini) {
      $bytes = [Convert]::FromBase64String($f.ini)
      $text = [Text.Encoding]::Unicode.GetString($bytes)
      if ($text -notmatch 'IconResource=') { $text = [Text.Encoding]::UTF8.GetString($bytes) }
      $m = [regex]::Match($text, '(?m)^\s*IconResource=(.+?)\s*$')
      if ($m.Success) { $loc = $m.Groups[1].Value }
    }
    if (-not $loc) { $loc = '%SystemRoot%\System32\imageres.dll,-3' }   # the standard folder icon
  } elseif ($v -and $v -notmatch '^\s*,?\s*-?\d*\s*$') { $loc = $v }   # ",0" = no icon of its own
  elseif ($p -like '*.lnk') { $t = [Iconwright.Lnk]::GetTarget($p); if ($t) { $loc = "$t,0" } }
  if (-not $loc) { return @{ fail = "'$($it.name)' had Windows' default icon before iconwright changed it. Restore its icon first (restore_icons), then restyle it." } }
  $r = Split-IconLocation $loc $p; $r.name = $it.name; $r
}

# "file,index" (environment variables allowed) -> {file,index}, or {shell} when the file is gone.
function Split-IconLocation([string]$loc, [string]$fallback) {
  $file = $loc; $index = 0
  if ($loc -match '^(.*),(-?\d+)$') { $file = $Matches[1]; $index = [int]$Matches[2] }
  $file = [Environment]::ExpandEnvironmentVariables($file.Trim('"'))
  if ($file -and (Test-Path -LiteralPath $file)) { return @{ file = $file; index = $index } }
  @{ shell = $fallback }
}

function Set-SystemIconsShown([string[]]$names, [bool]$show) {
  if (-not (Test-Path -LiteralPath $HideKey)) { New-Item -Path $HideKey -Force | Out-Null }
  $done = @()
  foreach ($n in $names) {
    $k = Get-SystemIconKey $n
    if (-not $k) { Fail "Unknown system icon '$n'. Known: $($SystemIcons.Keys -join ', ')" }
    New-ItemProperty -LiteralPath $HideKey -Name $SystemIcons[$k] -Value ([int](-not $show)) -PropertyType DWord -Force | Out-Null
    $done += $k
  }
  [Iconwright.Refresh]::Associations()
  try { [Iconwright.ExplorerShell]::DesktopView().Refresh() } catch { }
  [pscustomobject]@{ shown = $show; icons = $done }
}

function Invoke-DesktopCommand([string]$sub) {
  switch ($sub) {
    'list' { Out-Json (Get-DesktopInfo) }
    'move' {
      if (@($Item).Count -ne 1) { Fail 'desktop-move takes one -Item and -X/-Y' }
      $it = Find-DesktopItem $Item[0] (Get-DesktopItems)
      [void][Iconwright.Desktop]::Move([string[]]@($it.path), [int[]]@($X), [int[]]@($Y)); Save-Desktop
      Out-Json (Get-DesktopItems | Where-Object { $_.path -eq $it.path })
    }
    'arrange' { Out-Json (Invoke-DesktopArrange $Item $(if ($By) { $By } else { 'name' }) $(if ($Corner) { $Corner } else { 'top-left' }) $(if ($Flow) { $Flow } else { 'columns' }) $Monitor) }
    'size' {
      $map = @{ small = 32; medium = 48; large = 96; xl = 128; huge = 256 }
      $px = if ($map.ContainsKey("$Value".ToLower())) { $map["$Value".ToLower()] } else { [int]$Value }
      if ($px -lt 16 -or $px -gt 256) { Fail 'Size must be 16-256 px or small|medium|large|xl|huge' }
      [Iconwright.Desktop]::SetIconSize($px); Save-Desktop
      Out-Json ([pscustomobject]@{ iconSize = [Iconwright.Desktop]::GetIconSize() })
    }
    'options' {
      $on = { param($v) $v -in @('on', 'true', '1', 'yes', 'show') }
      if ($AutoArrange) { [Iconwright.Desktop]::AutoArrange = (& $on $AutoArrange) }
      if ($SnapToGrid) { [Iconwright.Desktop]::SnapToGrid = (& $on $SnapToGrid) }
      if ($ShowIcons) { [Iconwright.Desktop]::IconsVisible = (& $on $ShowIcons) }
      Save-Desktop
      $i = Get-DesktopInfo
      Out-Json ([pscustomobject]@{ autoArrange = $i.autoArrange; snapToGrid = $i.snapToGrid; iconsVisible = $i.iconsVisible })
    }
    'system' {
      if (-not $Item) { Fail 'desktop-system needs -Item <names> and -Value show|hide' }
      Out-Json (Set-SystemIconsShown $Item ("$Value" -in @('show', 'on', 'true', '1')))
    }
    'set-icon' {
      if (@($Item).Count -ne 1 -or -not $Icon) { Fail 'desktop-set-icon needs one -Item and -Icon <file.ico>' }
      Out-Json (Set-DesktopIcon $Item[0] (Resolve-Path -LiteralPath $Icon).Path $IconIndex)
    }
    'icon-image' {
      # Saves each item's own icon as an image to restyle; .ico files are returned as they are.
      $dir = if ($File) { $File } else { Join-Path $Home_ 'cache\desktop-icons' }
      New-Item -ItemType Directory -Force $dir | Out-Null
      Out-Json @(foreach ($k in @($Item)) {
        try {
          $src = Get-DesktopIconSource $k
          # A hashtable: index it, since a missing key read as a property fails under strict mode.
          if ($src['fail']) { throw $src['fail'] }
          if ($src['file'] -and $src['file'] -match '\.ico$') { $img = $src['file'] }
          else {
            # Two names can clean up to the same text, so the file name also carries a hash.
            $h = [BitConverter]::ToString((New-Object Security.Cryptography.SHA1Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$k))).Replace('-', '').Substring(0, 8)
            $img = Join-Path $dir ((([string]$src['name']) -replace '[^\w.-]+', '-') + "-$h.png")
            if ($src['file']) { [void][Iconwright.IconImage]::FromFile($src['file'], $src['index'], 256, $img) }
            else { [void][Iconwright.IconImage]::FromShellItem($src['shell'], 256, $img) }
          }
          [pscustomobject]@{ item = $src['name']; image = $img }
        } catch { [pscustomobject]@{ item = $k; error = $_.Exception.Message } }
      })
    }
    'restore' { Out-Json @($Item | ForEach-Object { Restore-DesktopIcon $_ }) }
    'save' {
      if (-not $File) { Fail 'desktop-save needs -File <layout.json>' }
      $i = Get-DesktopInfo
      [pscustomobject]@{ iconSize = $i.iconSize; autoArrange = $i.autoArrange; snapToGrid = $i.snapToGrid; items = $i.items } |
        ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $File -Encoding UTF8
      Out-Json ([pscustomobject]@{ saved = $File; items = @($i.items).Count })
    }
    'load' {
      if (-not (Test-Path -LiteralPath $File)) { Fail "Layout file not found: $File" }
      $l = Get-Content -LiteralPath $File -Raw | ConvertFrom-Json
      if ($l.iconSize) { [Iconwright.Desktop]::SetIconSize([int]$l.iconSize) }
      $its = @($l.items)
      $n = [Iconwright.Desktop]::Move([string[]]@($its | ForEach-Object path), [int[]]@($its | ForEach-Object x), [int[]]@($its | ForEach-Object y))
      if ($null -ne $l.autoArrange) { [Iconwright.Desktop]::AutoArrange = [bool]$l.autoArrange }
      Save-Desktop
      Out-Json ([pscustomobject]@{ loaded = $File; moved = $n; missing = @($its).Count - $n })
    }
    default { Fail "Unknown desktop command '$sub'" }
  }
}
