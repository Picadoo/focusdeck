$log = 'D:\Tools\focusdeck\scripts\try-attach-display3.log'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s) { $script:lines.Add($s) }

L(('started {0}' -f (Get-Date -Format o)))

$code = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class Disp3 {
  public const int ENUM_CURRENT_SETTINGS = -1;
  public const int ENUM_REGISTRY_SETTINGS = -2;
  public const uint EDS_RAWMODE = 0x00000002;
  public const uint EDS_ROTATEDMODE = 0x00000004;
  public const uint CDS_UPDATEREGISTRY = 0x00000001;
  public const uint CDS_TEST = 0x00000002;
  public const uint CDS_FULLSCREEN = 0x00000004;
  public const uint CDS_NORESET = 0x10000000;
  public const uint CDS_RESET = 0x40000000;
  public const uint CDS_SET_PRIMARY = 0x00000010;
  public const int DISP_CHANGE_SUCCESSFUL = 0;
  public const uint EDD_GET_DEVICE_INTERFACE_NAME = 0x00000001;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string DeviceKey;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string dmDeviceName;
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
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string dmFormName;
    public short dmLogPixels;
    public int dmBitsPerPel;
    public int dmPelsWidth;
    public int dmPelsHeight;
    public int dmDisplayFlags;
    public int dmDisplayFrequency;
    public int dmICMMethod;
    public int dmICMIntent;
    public int dmMediaType;
    public int dmDitherType;
    public int dmReserved1;
    public int dmReserved2;
    public int dmPanningWidth;
    public int dmPanningHeight;
  }

  [DllImport("user32.dll", CharSet = CharSet.Ansi)]
  public static extern bool EnumDisplayDevices(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);

  [DllImport("user32.dll", CharSet = CharSet.Ansi)]
  public static extern bool EnumDisplaySettingsEx(string lpszDeviceName, int iModeNum, ref DEVMODE lpDevMode, uint dwFlags);

  [DllImport("user32.dll", CharSet = CharSet.Ansi)]
  public static extern int ChangeDisplaySettingsEx(string lpszDeviceName, ref DEVMODE lpDevMode, IntPtr hwnd, uint dwflags, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern int ChangeDisplaySettingsEx(string lpszDeviceName, IntPtr lpDevMode, IntPtr hwnd, uint dwflags, IntPtr lParam);

  public static string DumpDevices() {
    var sb = new StringBuilder();
    for (uint i = 0; i < 16; i++) {
      var d = new DISPLAY_DEVICE();
      d.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
      if (!EnumDisplayDevices(null, i, ref d, EDD_GET_DEVICE_INTERFACE_NAME)) break;
      sb.AppendFormat("ADAPTER {0} name={1} str={2} flags=0x{3:X} id={4}\n", i, d.DeviceName, d.DeviceString, d.StateFlags, d.DeviceID);
      for (uint m = 0; m < 8; m++) {
        var mon = new DISPLAY_DEVICE();
        mon.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
        if (!EnumDisplayDevices(d.DeviceName, m, ref mon, EDD_GET_DEVICE_INTERFACE_NAME)) break;
        sb.AppendFormat("  MON {0} name={1} str={2} flags=0x{3:X} id={4}\n", m, mon.DeviceName, mon.DeviceString, mon.StateFlags, mon.DeviceID);
      }
      var cur = new DEVMODE();
      cur.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
      bool hasCur = EnumDisplaySettingsEx(d.DeviceName, ENUM_CURRENT_SETTINGS, ref cur, 0);
      var reg = new DEVMODE();
      reg.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
      bool hasReg = EnumDisplaySettingsEx(d.DeviceName, ENUM_REGISTRY_SETTINGS, ref reg, 0);
      sb.AppendFormat("  CUR has={0} {1}x{2}@{3} pos={4},{5} fields=0x{6:X}\n", hasCur, cur.dmPelsWidth, cur.dmPelsHeight, cur.dmDisplayFrequency, cur.dmPositionX, cur.dmPositionY, cur.dmFields);
      sb.AppendFormat("  REG has={0} {1}x{2}@{3} pos={4},{5} fields=0x{6:X}\n", hasReg, reg.dmPelsWidth, reg.dmPelsHeight, reg.dmDisplayFrequency, reg.dmPositionX, reg.dmPositionY, reg.dmFields);
      int modeCount = 0;
      var mode = new DEVMODE();
      mode.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
      while (EnumDisplaySettingsEx(d.DeviceName, modeCount, ref mode, 0) && modeCount < 8) {
        sb.AppendFormat("  MODE {0} {1}x{2}@{3}\n", modeCount, mode.dmPelsWidth, mode.dmPelsHeight, mode.dmDisplayFrequency);
        modeCount++;
        mode = new DEVMODE();
        mode.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
      }
      sb.AppendFormat("  modeCountAtLeast={0}\n", modeCount);
    }
    return sb.ToString();
  }

  public static string TryAttach(string device, int x, int y, int w, int h, int freq) {
    var sb = new StringBuilder();
    var dm = new DEVMODE();
    dm.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
    bool got = EnumDisplaySettingsEx(device, ENUM_REGISTRY_SETTINGS, ref dm, 0);
    if (!got) got = EnumDisplaySettingsEx(device, 0, ref dm, 0);
    sb.AppendFormat("gotMode={0} before {1}x{2}@{3} pos={4},{5}\n", got, dm.dmPelsWidth, dm.dmPelsHeight, dm.dmDisplayFrequency, dm.dmPositionX, dm.dmPositionY);
    if (w > 0) dm.dmPelsWidth = w;
    if (h > 0) dm.dmPelsHeight = h;
    if (freq > 0) dm.dmDisplayFrequency = freq;
    if (dm.dmBitsPerPel == 0) dm.dmBitsPerPel = 32;
    dm.dmPositionX = x;
    dm.dmPositionY = y;
    dm.dmFields = 0x00000020 | 0x00080000 | 0x00100000 | 0x00400000; // position | bits | width | height
    if (freq > 0) dm.dmFields |= 0x00800000;
    int test = ChangeDisplaySettingsEx(device, ref dm, IntPtr.Zero, CDS_NORESET | CDS_UPDATEREGISTRY, IntPtr.Zero);
    sb.AppendFormat("CDS_NORESET test/apply rc={0}\n", test);
    int apply = ChangeDisplaySettingsEx(null, IntPtr.Zero, IntPtr.Zero, CDS_RESET, IntPtr.Zero);
    sb.AppendFormat("CDS_RESET rc={0}\n", apply);
    return sb.ToString();
  }
}
'@

try {
  Add-Type -TypeDefinition $code -Language CSharp
  L('Add-Type ok')
} catch {
  L(('Add-Type error {0}' -f $_.Exception.ToString()))
}

L('=== EnumDisplayDevices ===')
try { L([Disp3]::DumpDevices()) } catch { L(('dump err {0}' -f $_.Exception.ToString())) }

L('=== GraphicsDrivers Configuration keys ===')
$cfgRoot = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Configuration'
if (Test-Path $cfgRoot) {
  Get-ChildItem $cfgRoot -ErrorAction SilentlyContinue | Select-Object -First 40 | ForEach-Object {
    L(('CFG {0}' -f $_.PSChildName))
  }
} else { L('no Configuration key') }

L('=== Connectivity keys (sample names) ===')
$connRoot = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Connectivity'
if (Test-Path $connRoot) {
  Get-ChildItem $connRoot -ErrorAction SilentlyContinue | Select-Object -First 40 | ForEach-Object {
    L(('CONN {0}' -f $_.PSChildName))
  }
} else { L('no Connectivity key') }

L('=== ScaleFactors / SetDisplayConfig persistence ===')
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' -ErrorAction SilentlyContinue | ForEach-Object {
  L(('GD {0}' -f $_.PSChildName))
}

L('=== Try attach DISPLAY3 at 1920,0 1920x1080 ===')
try { L([Disp3]::TryAttach('\\.\DISPLAY3', 1920, 0, 1920, 1080, 60)) } catch { L(('attach3 err {0}' -f $_.Exception.Message)) }

Start-Sleep -Seconds 2
L('=== devices after attach3 ===')
try { L([Disp3]::DumpDevices()) } catch { L(('dump2 err {0}' -f $_.Exception.Message)) }

Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
L(('screenCount={0}' -f $screens.Length))
$i = 0
foreach ($s in $screens) {
  $b = $s.Bounds
  L(('SCREEN {0} name={1} primary={2} bounds={3},{4} {5}x{6}' -f $i, $s.DeviceName, $s.Primary, $b.X, $b.Y, $b.Width, $b.Height))
  $i++
}

L('=== video controllers ===')
Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | ForEach-Object {
  L(('GPU {0} PNP={1} status={2} avail={3} res={4}x{5}' -f $_.Name, $_.PNPDeviceID, $_.Status, $_.Availability, $_.CurrentHorizontalResolution, $_.CurrentVerticalResolution))
}

L('=== desktop monitors ===')
Get-CimInstance Win32_DesktopMonitor -ErrorAction SilentlyContinue | ForEach-Object {
  L(('DESK {0} PNP={1} status={2} avail={3} {4}x{5}' -f $_.Name, $_.PNPDeviceID, $_.Status, $_.Availability, $_.ScreenWidth, $_.ScreenHeight))
}

L('=== focusdeck binaries ===')
@(
  'D:\Tools\focusdeck\src-tauri\target\release\focusdeck.exe',
  'D:\Tools\focusdeck\src-tauri\target\debug\focusdeck.exe'
) | ForEach-Object {
  L(('exe exists={0} path={1}' -f (Test-Path $_), $_))
}

L('=== browsers ===')
@(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | ForEach-Object {
  L(('browser exists={0} path={1}' -f (Test-Path $_), $_))
}

[IO.File]::WriteAllLines($log, $lines)
Write-Output ('wrote ' + $log)
