$log = 'D:\Tools\focusdeck\scripts\open-focusdeck-third.log'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s) { $script:lines.Add($s) }
L(('started {0}' -f (Get-Date -Format o)))

Add-Type -AssemblyName System.Windows.Forms
$screens = @([System.Windows.Forms.Screen]::AllScreens)
L(('screenCount={0}' -f $screens.Length))
$i = 0
foreach ($s in $screens) {
  $b = $s.Bounds
  L(('SCREEN {0} name={1} primary={2} bounds={3},{4} {5}x{6}' -f $i, $s.DeviceName, $s.Primary, $b.X, $b.Y, $b.Width, $b.Height))
  $i++
}

if ($screens.Length -lt 3) {
  L('NEED_THIRD_SCREEN')
  [IO.File]::WriteAllLines($log, $lines)
  Write-Output 'NEED_THIRD_SCREEN'
  exit 2
}

$target = $screens | Where-Object { $_.Bounds.Width -ge 2000 -and $_.Bounds.Height -ge 1400 } | Select-Object -First 1
if (-not $target) {
  $target = $screens | Where-Object { -not $_.Primary } | Sort-Object { $_.Bounds.X } | Select-Object -Last 1
}
if (-not $target) { $target = $screens[-1] }

$b = $target.Bounds
L(('TARGET name={0} primary={1} bounds={2},{3} {4}x{5}' -f $target.DeviceName, $target.Primary, $b.X, $b.Y, $b.Width, $b.Height))

$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) {
  L('NO_CHROME')
  [IO.File]::WriteAllLines($log, $lines)
  Write-Output 'NO_CHROME'
  exit 3
}

$url = 'http://localhost:5173/'
$args = @(
  '--new-window',
  '--start-fullscreen',
  ('--window-position={0},{1}' -f $b.X, $b.Y),
  ('--window-size={0},{1}' -f $b.Width, $b.Height),
  ('--app={0}' -f $url)
)
L(('chrome {0}' -f ($args -join ' ')))
Start-Process -FilePath $chrome -ArgumentList $args
Start-Sleep -Seconds 2
L('launched')
[IO.File]::WriteAllLines($log, $lines)
Write-Output ('LAUNCHED {0} {1},{2} {3}x{4}' -f $target.DeviceName, $b.X, $b.Y, $b.Width, $b.Height)
