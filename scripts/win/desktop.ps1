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
  $m = @($items | Where-Object { $_.name -eq $key -or $_.path -eq $key })
  if (-not $m.Count) { $m = @($items | Where-Object { $_.name -like "*$key*" }) }
  if ($m.Count -eq 1) { return $m[0] }
  if (-not $m.Count) { Fail "No desktop item matches '$key'. Try: iconwright desktop list" }
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
    systemIcons = @(foreach ($k in $SystemIcons.Keys) {
      $v = if ($hidden) { $hidden.PSObject.Properties[$SystemIcons[$k]] } else { $null }
      [pscustomobject]@{ name = $k; shown = -not ($v -and $v.Value -eq 1) } })
    items = @(Get-DesktopItems)
  }
}

# Lays items out on the grid. Order: explicit -Item list first, then the rest sorted by -By.
function Invoke-DesktopArrange([string[]]$first, [string]$by, [string]$corner, [string]$flow) {
  $items = Get-DesktopItems
  $ordered = New-Object System.Collections.ArrayList
  foreach ($k in @($first | Where-Object { $_ })) { $it = Find-DesktopItem $k $items; if ($ordered -notcontains $it) { [void]$ordered.Add($it) } }
  $rest = @($items | Where-Object { $ordered -notcontains $_ })
  switch ($by) {
    'type'  { $rest = @($rest | Sort-Object { [IO.Path]::GetExtension($_.path) }, name) }
    'none'  { $rest = @($rest | Sort-Object y, x) }   # keep current visual order
    default { $rest = @($rest | Sort-Object name) }
  }
  foreach ($r in $rest) { [void]$ordered.Add($r) }

  $sp = [Iconwright.Desktop]::Spacing(); $wa = [Iconwright.Desktop]::WorkArea()
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

function Set-DesktopIcon([string]$key, [string]$ico, [int]$idx) {
  $state = Get-State
  $sys = Get-SystemIconKey $key
  if ($sys) {
    $clsid = $SystemIcons[$sys]
    $k = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\CLSID\$clsid\DefaultIcon"
    $id = "clsid:$clsid"
    if (-not $state.originals.PSObject.Properties[$id]) {
      $orig = @{}
      if (Test-Path -LiteralPath $k) { (Get-Item -LiteralPath $k).Property | ForEach-Object { $orig[$_] = (Get-Item -LiteralPath $k).GetValue($_, $null, 'DoNotExpandEnvironmentNames') } }
      $state.originals | Add-Member -NotePropertyName $id -NotePropertyValue ($orig | ConvertTo-Json -Compress)
    }
    New-Item -Path $k -Force | Out-Null
    $v = "$ico,$idx"
    Set-ItemProperty -LiteralPath $k -Name '(default)' -Value $v
    if ($sys -eq 'recycle-bin') { Set-ItemProperty -LiteralPath $k -Name 'empty' -Value $v; Set-ItemProperty -LiteralPath $k -Name 'full' -Value $v }
    Save-State $state; [Iconwright.Refresh]::Associations()
    return [pscustomobject]@{ item = $sys; icon = $ico }
  }
  $it = Find-DesktopItem $key (Get-DesktopItems)
  $p = $it.path
  if ($p -like '*.lnk') {
    Remember-Original $state $p; [Iconwright.Lnk]::SetIcon($p, $ico, $idx)
  } elseif ($p -like '*.url') {
    $lines = [Collections.Generic.List[string]](Get-Content -LiteralPath $p)
    if (-not $state.originals.PSObject.Properties[$p]) {
      $f = ($lines | Where-Object { $_ -like 'IconFile=*' }) -replace '^IconFile=', ''
      $n = ($lines | Where-Object { $_ -like 'IconIndex=*' }) -replace '^IconIndex=', ''
      $state.originals | Add-Member -NotePropertyName $p -NotePropertyValue $(if ($f) { "$f,$(if ($n) { $n } else { 0 })" } else { '' })
    }
    $lines = [Collections.Generic.List[string]]@($lines | Where-Object { $_ -notlike 'IconFile=*' -and $_ -notlike 'IconIndex=*' })
    $at = [math]::Max(0, $lines.IndexOf('[InternetShortcut]')) + 1
    $lines.Insert($at, "IconIndex=$idx"); $lines.Insert($at, "IconFile=$ico")
    Set-Content -LiteralPath $p -Value $lines -Encoding ASCII
  } elseif (Test-Path -LiteralPath $p -PathType Container) {
    $ini = Join-Path $p 'desktop.ini'
    if (-not $state.originals.PSObject.Properties[$p]) {
      $old = if (Test-Path -LiteralPath $ini) { (Get-Content -LiteralPath $ini | Where-Object { $_ -like 'IconResource=*' }) -replace '^IconResource=', '' } else { '' }
      $state.originals | Add-Member -NotePropertyName $p -NotePropertyValue ([string]$old)
    }
    if (Test-Path -LiteralPath $ini) { (Get-Item -LiteralPath $ini -Force).Attributes = 'Normal' }
    $body = if (Test-Path -LiteralPath $ini) { @(Get-Content -LiteralPath $ini | Where-Object { $_ -notlike 'IconResource=*' }) } else { @() }
    if ($body -notcontains '[.ShellClassInfo]') { $body = @('[.ShellClassInfo]') + $body }
    $i = [array]::IndexOf($body, '[.ShellClassInfo]'); $body = @($body[0..$i]) + @("IconResource=$ico,$idx") + @($body | Select-Object -Skip ($i + 1))
    Set-Content -LiteralPath $ini -Value $body -Encoding Unicode
    (Get-Item -LiteralPath $ini -Force).Attributes = 'Hidden, System'
    $d = Get-Item -LiteralPath $p; $d.Attributes = $d.Attributes -bor [IO.FileAttributes]::ReadOnly
  } else {
    Fail "'$($it.name)' is a regular file; its icon comes from its file type. Use a shortcut to it instead."
  }
  Save-State $state; [Iconwright.Refresh]::Item($p)
  [pscustomobject]@{ item = $it.name; path = $p; icon = $ico }
}

function Restore-DesktopIcon([string]$key) {
  $state = Get-State
  $sys = Get-SystemIconKey $key
  if ($sys) {
    $clsid = $SystemIcons[$sys]; $id = "clsid:$clsid"
    $k = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\CLSID\$clsid\DefaultIcon"
    $o = $state.originals.PSObject.Properties[$id]
    if (-not $o) { return [pscustomobject]@{ restored = $false } }
    Remove-Item -LiteralPath $k -Recurse -Force -ErrorAction SilentlyContinue
    $vals = $o.Value | ConvertFrom-Json
    if ($vals -and @($vals.PSObject.Properties).Count) {
      New-Item -Path $k -Force | Out-Null
      foreach ($pp in $vals.PSObject.Properties) {
        $name = if ($pp.Name -eq '') { '(default)' } else { $pp.Name }
        New-ItemProperty -LiteralPath $k -Name $name -Value $pp.Value -PropertyType ExpandString -Force | Out-Null
      }
    }
    $state.originals.PSObject.Properties.Remove($id); Save-State $state; [Iconwright.Refresh]::Associations()
    return [pscustomobject]@{ restored = $true; item = $sys }
  }
  $it = Find-DesktopItem $key (Get-DesktopItems); $p = $it.path
  $o = $state.originals.PSObject.Properties[$p]
  if (-not $o) { return [pscustomobject]@{ restored = $false; item = $it.name } }
  $v = [string]$o.Value; $f = ''; $n = 0
  if ($v -match '^(.*),(-?\d+)$') { $f = $Matches[1]; $n = [int]$Matches[2] } elseif ($v) { $f = $v }
  if ($p -like '*.lnk') { [Iconwright.Lnk]::SetIcon($p, $f, $n) }
  elseif ($p -like '*.url') {
    $lines = @(Get-Content -LiteralPath $p | Where-Object { $_ -notlike 'IconFile=*' -and $_ -notlike 'IconIndex=*' })
    if ($f) { $lines += "IconFile=$f"; $lines += "IconIndex=$n" }
    Set-Content -LiteralPath $p -Value $lines -Encoding ASCII
  } else {
    $ini = Join-Path $p 'desktop.ini'
    if (Test-Path -LiteralPath $ini) {
      (Get-Item -LiteralPath $ini -Force).Attributes = 'Normal'
      $body = @(Get-Content -LiteralPath $ini | Where-Object { $_ -notlike 'IconResource=*' })
      if ($v) { $i = [array]::IndexOf($body, '[.ShellClassInfo]'); $body = @($body[0..$i]) + @("IconResource=$v") + @($body | Select-Object -Skip ($i + 1)) }
      Set-Content -LiteralPath $ini -Value $body -Encoding Unicode
      (Get-Item -LiteralPath $ini -Force).Attributes = 'Hidden, System'
    }
  }
  $state.originals.PSObject.Properties.Remove($p); Save-State $state; [Iconwright.Refresh]::Item($p)
  [pscustomobject]@{ restored = $true; item = $it.name }
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
    'arrange' { Out-Json (Invoke-DesktopArrange $Item $(if ($By) { $By } else { 'name' }) $(if ($Corner) { $Corner } else { 'top-left' }) $(if ($Flow) { $Flow } else { 'columns' })) }
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
