$log = 'D:\Tools\focusdeck\scripts\enable-benq-and-scan.log'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s) { $script:lines.Add($s) }

L(('started {0}' -f (Get-Date -Format o)))
L('=== whoami ===')
L((whoami /priv | Select-String 'SeLoadDriverPrivilege|SeDebugPrivilege|SeTakeOwnershipPrivilege' | Out-String).Trim())

L('=== display class ===')
Get-PnpDevice -Class Display -ErrorAction SilentlyContinue | ForEach-Object {
  L(('DISPLAY {0} | {1} | {2} | problem={3}' -f $_.Status, $_.FriendlyName, $_.InstanceId, $_.Problem))
}

L('=== monitor class ===')
Get-PnpDevice -Class Monitor -ErrorAction SilentlyContinue | ForEach-Object {
  L(('MONITOR {0} | {1} | {2} | problem={3}' -f $_.Status, $_.FriendlyName, $_.InstanceId, $_.Problem))
}

L('=== USB display-ish ===')
Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object {
  $_.FriendlyName -match 'Idd|Indirect|Virtual Display|USB.*Display|DisplayLink|ToDesk|Sunshine|Oray|monitor|Monitor' -or
  $_.InstanceId -match 'DISPLAY|USB\\VID'
} | Select-Object -First 80 | ForEach-Object {
  L(('PNP {0} | {1} | {2}' -f $_.Status, $_.FriendlyName, $_.InstanceId))
}

L('=== WmiMonitorID ===')
try {
  Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -ErrorAction Stop | ForEach-Object {
    $name = ($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join ''
    $mfr = ($_.ManufacturerName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join ''
    $sn = ($_.SerialNumberID | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join ''
    L(('WMI active={0} inst={1} mfr={2} name={3} sn={4}' -f $_.Active, $_.InstanceName, $mfr, $name, $sn))
  }
} catch { L(('WmiMonitorID err {0}' -f $_.Exception.Message)) }

L('=== WmiMonitorConnectionParams ===')
try {
  Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorConnectionParams -ErrorAction Stop | ForEach-Object {
    L(('CONN active={0} inst={1} videoOutput={2}' -f $_.Active, $_.InstanceName, $_.VideoOutputTechnology))
  }
} catch { L(('CONN err {0}' -f $_.Exception.Message)) }

L('=== enable BNQ ===')
$bnqs = Get-PnpDevice -Class Monitor -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like '*BNQ78FF*' }
if (-not $bnqs) { L('no BNQ78FF devices') }
foreach ($d in $bnqs) {
  L(('before {0} {1}' -f $d.Status, $d.InstanceId))
  try {
    Enable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction Stop
    L(('Enable-PnpDevice ok {0}' -f $d.InstanceId))
  } catch {
    L(('Enable-PnpDevice fail {0} :: {1}' -f $d.InstanceId, $_.Exception.Message))
  }
}

L('=== scan devices ===')
try {
  $scan = & pnputil.exe /scan-devices 2>&1 | Out-String
  L($scan.Trim())
} catch { L(('pnputil err {0}' -f $_.Exception.Message)) }

Start-Sleep -Seconds 3

L('=== monitor after ===')
Get-PnpDevice -Class Monitor -ErrorAction SilentlyContinue | ForEach-Object {
  L(('MONITOR {0} | {1} | {2}' -f $_.Status, $_.FriendlyName, $_.InstanceId))
}

Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
L(('screenCount={0}' -f $screens.Length))
$i = 0
foreach ($s in $screens) {
  $b = $s.Bounds
  L(('SCREEN {0} name={1} primary={2} bounds={3},{4} {5}x{6}' -f $i, $s.DeviceName, $s.Primary, $b.X, $b.Y, $b.Width, $b.Height))
  $i++
}

[IO.File]::WriteAllLines($log, $lines)
Write-Output ('wrote ' + $log)
