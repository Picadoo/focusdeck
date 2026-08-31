$log = 'D:\Tools\focusdeck\scripts\attach-inactive-heads.log'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s) { $script:lines.Add($s) }
L(('started {0}' -f (Get-Date -Format o)))

$code = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class Heads {
  public const int ENUM_CURRENT_SETTINGS = -1;
  public const int ENUM_REGISTRY_SETTINGS = -2;
  public const uint EDD_GET_DEVICE_INTERFACE_NAME = 0x00000001;
  public const uint CDS_UPDATEREGISTRY = 0x00000001;
  public const uint CDS_NORESET = 0x10000000;
  public const uint CDS_RESET = 0x40000000;
  public const int DM_ORIENTATION = 0x00000001;
  public const int DM_POSITION = 0x00000020;
  public const int DM_BITSPERPEL = 0x00040000;
  public const int DM_PELSWIDTH = 0x00080000;
  public const int DM_PELSHEIGHT = 0x00100000;
  public const int DM_DISPLAYFREQUENCY = 0x00400000;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
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
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
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

  public static string Dump() {
    var sb = new StringBuilder();
    for (uint i = 0; i < 20; i++) {
      var d = new DISPLAY_DEVICE();
      d.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
      if (!EnumDisplayDevices(null, i, ref d, EDD_GET_DEVICE_INTERFACE_NAME)) break;
      sb.AppendFormat("ADAPTER {0} name={1} str={2} flags=0x{3:X}\n", i, d.DeviceName, d.DeviceString, d.StateFlags);
      for (uint m = 0; m < 4; m++) {
        var mon = new DISPLAY_DEVICE();
        mon.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
        if (!EnumDisplayDevices(d.DeviceName, m, ref mon, EDD_GET_DEVICE_INTERFACE_NAME)) break;
        sb.AppendFormat("  MON {0} name={1} str={2} flags=0x{3:X} id={4}\n", m, mon.DeviceName, mon.DeviceString, mon.StateFlags, mon.DeviceID);
      }
      var cur = NewDm();
      bool hasCur = EnumDisplaySettingsEx(d.DeviceName, ENUM_CURRENT_SETTINGS, ref cur, 0);
      var reg = NewDm();
      bool hasReg = EnumDisplaySettingsEx(d.DeviceName, ENUM_REGISTRY_SETTINGS, ref reg, 0);
      sb.AppendFormat("  CUR has={0} {1}x{2}@{3} pos={4},{5}\n", hasCur, cur.dmPelsWidth, cur.dmPelsHeight, cur.dmDisplayFrequency, cur.dmPositionX, cur.dmPositionY);
      sb.AppendFormat("  REG has={0} {1}x{2}@{3} pos={4},{5} fields=0x{6:X}\n", hasReg, reg.dmPelsWidth, reg.dmPelsHeight, reg.dmDisplayFrequency, reg.dmPositionX, reg.dmPositionY, reg.dmFields);
      int n = 0;
      var mode = NewDm();
      while (n < 6 && EnumDisplaySettingsEx(d.DeviceName, n, ref mode, 0)) {
        sb.AppendFormat("  MODE {0} {1}x{2}@{3} bits={4}\n", n, mode.dmPelsWidth, mode.dmPelsHeight, mode.dmDisplayFrequency, mode.dmBitsPerPel);
        n++;
        mode = NewDm();
      }
      sb.AppendFormat("  modeCountAtLeast={0}\n", n);
    }
    return sb.ToString();
  }

  static DEVMODE NewDm() {
    var dm = new DEVMODE();
    dm.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
    return dm;
  }

  public static string TryAttach(string device, int x, int y, int w, int h, int freq) {
    var sb = new StringBuilder();
    var dm = NewDm();
    bool got = EnumDisplaySettingsEx(device, 0, ref dm, 0);
    if (!got) got = EnumDisplaySettingsEx(device, ENUM_REGISTRY_SETTINGS, ref dm, 0);
    sb.AppendFormat("{0} gotMode={1} before {2}x{3}@{4} pos={5},{6} bits={7}\n", device, got, dm.dmPelsWidth, dm.dmPelsHeight, dm.dmDisplayFrequency, dm.dmPositionX, dm.dmPositionY, dm.dmBitsPerPel);
    if (!got) {
      dm = NewDm();
      dm.dmDeviceName = device;
    }
    dm.dmPelsWidth = w;
    dm.dmPelsHeight = h;
    dm.dmDisplayFrequency = freq;
    if (dm.dmBitsPerPel == 0) dm.dmBitsPerPel = 32;
    dm.dmPositionX = x;
    dm.dmPositionY = y;
    dm.dmFields = DM_POSITION | DM_PELSWIDTH | DM_PELSHEIGHT | DM_BITSPERPEL | DM_DISPLAYFREQUENCY;
    int rc1 = ChangeDisplaySettingsEx(device, ref dm, IntPtr.Zero, CDS_NORESET | CDS_UPDATEREGISTRY, IntPtr.Zero);
    sb.AppendFormat("  CDS_NORESET rc={0}\n", rc1);
    int rc2 = ChangeDisplaySettingsEx(null, IntPtr.Zero, IntPtr.Zero, CDS_RESET, IntPtr.Zero);
    sb.AppendFormat("  CDS_RESET rc={0}\n", rc2);
    return sb.ToString();
  }
}
'@

try { Add-Type -TypeDefinition $code -Language CSharp; L('Add-Type ok') }
catch { L(('Add-Type err {0}' -f $_.Exception.ToString())) }

L('=== BEFORE ===')
try { L([Heads]::Dump()) } catch { L(('dump err {0}' -f $_.Exception.ToString())) }

$tries = @(
  @('\\.\DISPLAY25', 0, 1440, 2560, 1440, 60),
  @('\\.\DISPLAY26', 2560, 0, 1920, 1080, 60),
  @('\\.\DISPLAY27', 1920, 0, 1920, 1200, 60),
  @('\\.\DISPLAY3', 0, -1440, 2560, 1440, 60)
)

foreach ($t in $tries) {
  L(('=== TRY {0} {1}x{2} at {3},{4} ===' -f $t[0], $t[3], $t[4], $t[1], $t[2]))
  try { L([Heads]::TryAttach($t[0], [int]$t[1], [int]$t[2], [int]$t[3], [int]$t[4], [int]$t[5])) }
  catch { L(('try err {0}' -f $_.Exception.Message)) }
  Start-Sleep -Seconds 1
}

L('=== AFTER ===')
try { L([Heads]::Dump()) } catch { L(('dump2 err {0}' -f $_.Exception.ToString())) }

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
Write-Output ('wrote ' + $log + ' count=' + $screens.Length)
