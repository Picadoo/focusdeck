$log = 'D:\Tools\focusdeck\scripts\list-screens-now.log'
$lines = New-Object System.Collections.Generic.List[string]
Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
$lines.Add(('screenCount={0}' -f $screens.Length))
$i = 0
foreach ($s in $screens) {
  $b = $s.Bounds
  $lines.Add(('SCREEN {0} name={1} primary={2} bounds={3},{4} {5}x{6}' -f $i, $s.DeviceName, $s.Primary, $b.X, $b.Y, $b.Width, $b.Height))
  $i++
}
Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue | ForEach-Object {
  $name = ($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join ''
  $mfr = ($_.ManufacturerName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join ''
  $lines.Add(('WMI active={0} mfr={1} name={2} inst={3}' -f $_.Active, $mfr, $name, $_.InstanceName))
}
[IO.File]::WriteAllLines($log, $lines)
Write-Output ('count=' + $screens.Length)
