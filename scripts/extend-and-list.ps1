$log = 'D:\Tools\focusdeck\scripts\extend-and-list.log'
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add(('started {0}' -f (Get-Date -Format o)))
try {
  Start-Process -FilePath "$env:SystemRoot\System32\DisplaySwitch.exe" -ArgumentList '/extend' -Wait -WindowStyle Hidden
  $lines.Add('DisplaySwitch /extend launched')
} catch {
  $lines.Add(('DisplaySwitch error: {0}' -f $_.Exception.Message))
}
Start-Sleep -Seconds 3
Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
$lines.Add(('screenCount={0}' -f $screens.Length))
$i = 0
foreach ($s in $screens) {
  $b = $s.Bounds
  $wa = $s.WorkingArea
  $lines.Add(('SCREEN {0} name={1} primary={2} bounds={3},{4} {5}x{6} work={7},{8} {9}x{10} bits={11}' -f $i, $s.DeviceName, $s.Primary, $b.X, $b.Y, $b.Width, $b.Height, $wa.X, $wa.Y, $wa.Width, $wa.Height, $s.BitsPerPixel))
  $i++
}
[IO.File]::WriteAllLines($log, $lines)
Write-Output "wrote $log count=$($screens.Length)"
