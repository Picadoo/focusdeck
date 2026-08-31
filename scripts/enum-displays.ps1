$ErrorActionPreference = 'Continue'
$log = 'D:\Tools\focusdeck\scripts\enum-displays.log'
try {
  $code = @'
using System;
using System.Runtime.InteropServices;
public static class NativeDisplay {
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern bool EnumDisplayDevices(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);

  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern bool EnumDisplaySettings(string deviceName, int modeNum, ref DEVMODE devMode);

  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceKey;
  }

  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName;
    public short dmSpecVersion;
    public short dmDriverVersion;
    public short dmSize;
    public short dmDriverExtra;
    public int dmFields;
    public int dmPositionX;
    public int dmPositionY;
    public int dmDisplayOrientation;
    public int dmDisplayFixedOutput;
    public short dmColor;
    public short dmDuplex;
    public short dmYResolution;
    public short dmTTOption;
    public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName;
    public short dmLogPixels;
    public int dmBitsPerPel;
    public int dmPelsWidth;
    public int dmPelsHeight;
    public int dmDisplayFlags;
    public int dmDisplayFrequency;
  }
}
'@
  Add-Type -TypeDefinition $code
  $lines = New-Object System.Collections.Generic.List[string]
  $adapter = New-Object NativeDisplay+DISPLAY_DEVICE
  $adapter.cb = [Runtime.InteropServices.Marshal]::SizeOf($adapter)
  $i = [uint32]0
  while ([NativeDisplay]::EnumDisplayDevices($null, $i, [ref]$adapter, 0)) {
    $lines.Add(("ADAPTER {0} Name={1} String={2} Flags={3}" -f $i, $adapter.DeviceName, $adapter.DeviceString, $adapter.StateFlags))
    $attached = ($adapter.StateFlags -band 1) -ne 0
    $primary = ($adapter.StateFlags -band 4) -ne 0
    $lines.Add(("  attached={0} primary={1}" -f $attached, $primary))
    if ($attached) {
      $mode = New-Object NativeDisplay+DEVMODE
      $mode.dmSize = [int16][Runtime.InteropServices.Marshal]::SizeOf($mode)
      if ([NativeDisplay]::EnumDisplaySettings($adapter.DeviceName, -1, [ref]$mode)) {
        $lines.Add(("  current={0}x{1} pos={2},{3} hz={4}" -f $mode.dmPelsWidth, $mode.dmPelsHeight, $mode.dmPositionX, $mode.dmPositionY, $mode.dmDisplayFrequency))
      }
    }
    $monitor = New-Object NativeDisplay+DISPLAY_DEVICE
    $monitor.cb = [Runtime.InteropServices.Marshal]::SizeOf($monitor)
    $j = [uint32]0
    while ([NativeDisplay]::EnumDisplayDevices($adapter.DeviceName, $j, [ref]$monitor, 0)) {
      $lines.Add(("  MONITOR {0} Name={1} String={2} Flags={3} ID={4}" -f $j, $monitor.DeviceName, $monitor.DeviceString, $monitor.StateFlags, $monitor.DeviceID))
      $j++
      $monitor = New-Object NativeDisplay+DISPLAY_DEVICE
      $monitor.cb = [Runtime.InteropServices.Marshal]::SizeOf($monitor)
    }
    $i++
    $adapter = New-Object NativeDisplay+DISPLAY_DEVICE
    $adapter.cb = [Runtime.InteropServices.Marshal]::SizeOf($adapter)
  }
  $lines.Add(("COUNT={0}" -f $i))
  [IO.File]::WriteAllLines($log, $lines)
  Write-Output "wrote $log"
} catch {
  [IO.File]::WriteAllText($log, ("ERR: {0}`n{1}" -f $Error[0].Exception.Message, $Error[0].ScriptStackTrace))
  Write-Output "failed $log"
}
