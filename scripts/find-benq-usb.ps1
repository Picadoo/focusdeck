$log = 'D:\Tools\focusdeck\scripts\find-benq-usb.log'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s) { $script:lines.Add($s) }
L(('started {0}' -f (Get-Date -Format o)))

L('=== PNP name match BNQ/BenQ/Monitor/Idd ===')
Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object {
  $_.FriendlyName -match 'BNQ|BenQ|Idd|Virtual Display|ToDesk|Oray' -or
  $_.InstanceId -match 'BNQ|BenQ|DISPLAY\\BNQ'
} | ForEach-Object {
  L(('PNP {0} | {1} | {2} | {3}' -f $_.Status, $_.Class, $_.FriendlyName, $_.InstanceId))
}

L('=== USB present devices ===')
Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like 'USB\*' } | ForEach-Object {
  L(('USB {0} | {1} | {2}' -f $_.Status, $_.FriendlyName, $_.InstanceId))
}

L('=== HID / USB audio that might be monitor ===')
Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
  $_.Class -match 'HID|Camera|MEDIA|USB|Monitor' -or $_.FriendlyName -match 'Audio|Speaker|Webcam|HID'
} | Select-Object -First 80 | ForEach-Object {
  L(('DEV {0} | {1} | {2} | {3}' -f $_.Status, $_.Class, $_.FriendlyName, $_.InstanceId))
}

L('=== tools ===')
$paths = @(
  'C:\Windows\nircmd.exe',
  'C:\Tools\nircmd.exe',
  'D:\Tools\nircmd.exe',
  'C:\Program Files\NirSoft\ControlMyMonitor\ControlMyMonitor.exe',
  'C:\Program Files\NirSoft\MultiMonitorTool\MultiMonitorTool.exe',
  'D:\Tools\ControlMyMonitor.exe',
  'D:\Tools\MultiMonitorTool.exe',
  'C:\Program Files\ToDesk\ToDesk.exe',
  'C:\Program Files (x86)\Oray\SunLogin\SunloginClient\SunloginClient.exe'
)
Get-ChildItem -Path 'C:\Program Files','C:\Program Files (x86)','D:\Tools' -Filter 'ToDesk.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 5 | ForEach-Object { L(('FOUND {0}' -f $_.FullName)) }
Get-ChildItem -Path 'C:\Program Files','C:\Program Files (x86)','D:\Tools' -Filter 'nircmd.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 5 | ForEach-Object { L(('FOUND {0}' -f $_.FullName)) }
Get-ChildItem -Path 'C:\Program Files','C:\Program Files (x86)','D:\Tools' -Filter 'ControlMyMonitor.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 5 | ForEach-Object { L(('FOUND {0}' -f $_.FullName)) }
Get-ChildItem -Path 'C:\Program Files','C:\Program Files (x86)','D:\Tools' -Filter 'MultiMonitorTool.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 5 | ForEach-Object { L(('FOUND {0}' -f $_.FullName)) }
foreach ($p in $paths) { L(('exists={0} {1}' -f (Test-Path $p), $p)) }

L('=== ToDesk service / process ===')
Get-Process | Where-Object { $_.Name -match 'ToDesk|Oray|Sunlogin|focusdeck|chrome' } | ForEach-Object {
  L(('PROC {0} pid={1}' -f $_.Name, $_.Id))
}

L('=== 5173 listen ===')
try {
  Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction Stop | ForEach-Object {
    L(('LISTEN 5173 pid={0}' -f $_.OwningProcess))
  }
} catch { L(('nettcp err {0}' -f $_.Exception.Message)) }

[IO.File]::WriteAllLines($log, $lines)
Write-Output ('wrote ' + $log)
