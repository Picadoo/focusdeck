$log = 'D:\Tools\focusdeck\scripts\find-monitors.log'
$lines = New-Object System.Collections.Generic.List[string]
try {
  $lines.Add('=== PnP Monitor ===')
  Get-PnpDevice -Class Monitor -ErrorAction SilentlyContinue | ForEach-Object {
    $lines.Add(("{0} | {1} | {2}" -f $_.Status, $_.FriendlyName, $_.InstanceId))
  }
  $lines.Add('=== PnP Display ===')
  Get-PnpDevice -Class Display -ErrorAction SilentlyContinue | ForEach-Object {
    $lines.Add(("{0} | {1} | {2}" -f $_.Status, $_.FriendlyName, $_.InstanceId))
  }
} catch {
  $lines.Add(('ERR {0}' -f $Error[0].Exception.Message))
}
[IO.File]::WriteAllLines($log, $lines)
Write-Output "wrote $log"
