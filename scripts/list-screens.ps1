Add-Type -AssemblyName System.Windows.Forms
Write-Output '=== Screen.AllScreens ==='
$i = 0
foreach ($screen in [System.Windows.Forms.Screen]::AllScreens) {
  $i++
  Write-Output ("SCREEN {0} Device={1} Primary={2} Bounds={3},{4} {5}x{6} Work={7},{8} {9}x{10} Bits={11}" -f $i, $screen.DeviceName, $screen.Primary, $screen.Bounds.X, $screen.Bounds.Y, $screen.Bounds.Width, $screen.Bounds.Height, $screen.WorkingArea.X, $screen.WorkingArea.Y, $screen.WorkingArea.Width, $screen.WorkingArea.Height, $screen.BitsPerPixel)
}

Write-Output '=== Win32_VideoController ==='
Get-CimInstance Win32_VideoController | ForEach-Object {
  Write-Output ("GPU={0} Current={1}x{2} PNP={3}" -f $_.Name, $_.CurrentHorizontalResolution, $_.CurrentVerticalResolution, $_.PNPDeviceID)
}

Write-Output '=== Win32_DesktopMonitor ==='
Get-CimInstance Win32_DesktopMonitor | ForEach-Object {
  Write-Output ("Monitor={0} DeviceID={1} PNP={2} Screen={3}x{4}" -f $_.Name, $_.DeviceID, $_.PNPDeviceID, $_.ScreenWidth, $_.ScreenHeight)
}

Write-Output '=== EnumDisplayDevices ==='
$src = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class DisplayEnum {
  [DllImport("user32.dll")]
  public static extern bool EnumDisplayDevices(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceKey;
  }
}
'@
Add-Type -TypeDefinition $src -ErrorAction SilentlyContinue
$dev = New-Object DisplayEnum+DISPLAY_DEVICE
$dev.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($dev)
$n = 0
while ([DisplayEnum]::EnumDisplayDevices($null, $n, [ref]$dev, 0)) {
  Write-Output ("Adapter {0} Name={1} String={2} Flags={3}" -f $n, $dev.DeviceName, $dev.DeviceString, $dev.StateFlags)
  $m = 0
  $mon = New-Object DisplayEnum+DISPLAY_DEVICE
  $mon.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($mon)
  while ([DisplayEnum]::EnumDisplayDevices($dev.DeviceName, $m, [ref]$mon, 0)) {
    Write-Output ("  Monitor {0} Name={1} String={2} Flags={3} ID={4}" -f $m, $mon.DeviceName, $mon.DeviceString, $mon.StateFlags, $mon.DeviceID)
    $m++
    $mon = New-Object DisplayEnum+DISPLAY_DEVICE
    $mon.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($mon)
  }
  $n++
  $dev = New-Object DisplayEnum+DISPLAY_DEVICE
  $dev.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($dev)
}

Write-Output '=== PORT 5173 ==='
netstat -ano | Select-String ':5173'
