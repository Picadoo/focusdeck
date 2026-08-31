$log = 'D:\Tools\focusdeck\scripts\open-focusdeck-now.log'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s) { $script:lines.Add($s) }
L(('started {0}' -f (Get-Date -Format o)))

$viteOk = $false
try {
  $r = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 5
  L(('vite={0}' -f $r.StatusCode))
  $viteOk = ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400)
} catch {
  L(('vite_err={0}' -f $_.Exception.Message))
}

Add-Type -AssemblyName System.Windows.Forms
$screens = @([System.Windows.Forms.Screen]::AllScreens)
L(('screenCount={0}' -f $screens.Length))
$i = 0
foreach ($s in $screens) {
  $b = $s.Bounds
  L(('SCREEN {0} name={1} primary={2} bounds={3},{4} {5}x{6}' -f $i, $s.DeviceName, $s.Primary, $b.X, $b.Y, $b.Width, $b.Height))
  $i++
}

$target = $screens | Where-Object { $_.Primary } | Select-Object -First 1
if (-not $target) { $target = $screens[0] }
$b = $target.Bounds
L(('TARGET name={0} primary={1} bounds={2},{3} {4}x{5}' -f $target.DeviceName, $target.Primary, $b.X, $b.Y, $b.Width, $b.Height))

if (-not $viteOk) {
  L('VITE_DOWN')
  [IO.File]::WriteAllLines($log, $lines)
  Write-Output 'VITE_DOWN'
  exit 4
}

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
