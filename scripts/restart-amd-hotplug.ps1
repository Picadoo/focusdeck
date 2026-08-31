$log = 'D:\Tools\focusdeck\scripts\restart-amd-hotplug.log'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s) { $script:lines.Add($s) }

L(('started {0}' -f (Get-Date -Format o)))

function Dump-Screens([string]$label) {
  Add-Type -AssemblyName System.Windows.Forms
  $screens = [System.Windows.Forms.Screen]::AllScreens
  L(('{0} screenCount={1}' -f $label, $screens.Length))
  $i = 0
  foreach ($s in $screens) {
    $b = $s.Bounds
    L(('  SCREEN {0} name={1} primary={2} bounds={3},{4} {5}x{6}' -f $i, $s.DeviceName, $s.Primary, $b.X, $b.Y, $b.Width, $b.Height))
    $i++
  }
  Get-PnpDevice -Class Monitor -ErrorAction SilentlyContinue | ForEach-Object {
    L(('  PNP {0} | {1} | {2} | {3}' -f $_.Status, $_.FriendlyName, $_.InstanceId, $_.Problem))
  }
}

Dump-Screens 'BEFORE'

L('=== find atiadlxx ===')
@(
  'C:\Windows\System32\atiadlxx.dll',
  'C:\Windows\SysWOW64\atiadlxx.dll',
  'C:\Windows\System32\atigktxx.dll'
) | ForEach-Object { L(('exists={0} {1}' -f (Test-Path $_), $_)) }

Get-ChildItem 'C:\Windows\System32' -Filter 'ati*.dll' -ErrorAction SilentlyContinue | ForEach-Object { L(('SYS32 {0}' -f $_.Name)) }
Get-ChildItem 'C:\Windows\System32' -Filter 'amd*.dll' -ErrorAction SilentlyContinue | Select-Object -First 30 | ForEach-Object { L(('SYS32 {0}' -f $_.Name)) }

L('=== restart AMD External Events Utility ===')
try {
  $svc = Get-Service -Name 'AMD External Events Utility' -ErrorAction Stop
  L(('svc before {0}' -f $svc.Status))
  Restart-Service -Name 'AMD External Events Utility' -Force -ErrorAction Stop
  Start-Sleep -Seconds 2
  $svc2 = Get-Service -Name 'AMD External Events Utility'
  L(('svc after {0}' -f $svc2.Status))
} catch {
  L(('restart svc err {0}' -f $_.Exception.Message))
}

L('=== pnputil scan ===')
try { L((& pnputil.exe /scan-devices 2>&1 | Out-String).Trim()) } catch { L(('scan err {0}' -f $_.Exception.Message)) }
Start-Sleep -Seconds 2
Dump-Screens 'AFTER_SCAN'

L('=== restart AMD GPU device ===')
$gpu = Get-PnpDevice -Class Display -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -like '*AMD Radeon*' -and $_.Status -eq 'OK' }
if (-not $gpu) { L('no AMD GPU found') }
foreach ($g in $gpu) {
  L(('gpu {0} {1}' -f $g.Status, $g.InstanceId))
  try {
    $out = & pnputil.exe /restart-device $g.InstanceId 2>&1 | Out-String
    L($out.Trim())
  } catch {
    L(('restart-device err {0}' -f $_.Exception.Message))
  }
}

Start-Sleep -Seconds 5
Dump-Screens 'AFTER_GPU_RESTART'

L('=== disable/enable GPU fallback if still 2 screens ===')
Add-Type -AssemblyName System.Windows.Forms
if ([System.Windows.Forms.Screen]::AllScreens.Length -lt 3 -and $gpu) {
  foreach ($g in $gpu) {
    L(('disable {0}' -f $g.InstanceId))
    try {
      $d = & pnputil.exe /disable-device $g.InstanceId 2>&1 | Out-String
      L($d.Trim())
    } catch { L(('disable err {0}' -f $_.Exception.Message)) }
    Start-Sleep -Seconds 3
    L(('enable {0}' -f $g.InstanceId))
    try {
      $e = & pnputil.exe /enable-device $g.InstanceId 2>&1 | Out-String
      L($e.Trim())
    } catch { L(('enable err {0}' -f $_.Exception.Message)) }
  }
  Start-Sleep -Seconds 6
  Dump-Screens 'AFTER_GPU_TOGGLE'
}

L('=== WmiMonitorID after ===')
try {
  Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -ErrorAction Stop | ForEach-Object {
    $name = ($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join ''
    $mfr = ($_.ManufacturerName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join ''
    L(('WMI active={0} inst={1} mfr={2} name={3}' -f $_.Active, $_.InstanceName, $mfr, $name))
  }
} catch { L(('WMI err {0}' -f $_.Exception.Message)) }

[IO.File]::WriteAllLines($log, $lines)
Write-Output ('wrote ' + $log)
