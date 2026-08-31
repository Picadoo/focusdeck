$log = 'D:\Tools\focusdeck\scripts\adl-probe.log'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s) { $script:lines.Add($s) }
L(('started {0}' -f (Get-Date -Format o)))

$code = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class AdlProbe {
  public const int ADL_OK = 0;
  public const int ADL_DISPLAY_DISPLAYINFO_DISPLAYCONNECTED = 0x00000001;
  public const int ADL_DISPLAY_DISPLAYINFO_DISPLAYMAPPED = 0x00000002;
  public const int ADL_DISPLAY_DISPLAYINFO_NONLOCAL = 0x00000004;
  public const int ADL_DISPLAY_DISPLAYINFO_FORCIBLESUPPORTED = 0x00000008;
  public const int ADL_DISPLAY_DISPLAYINFO_GENLOCK_SUPPORTED = 0x00000010;
  public const int ADL_DISPLAY_DISPLAYINFO_MULTIVPU_SUPPORTED = 0x00000020;
  public const int ADL_DISPLAY_DISPLAYINFO_LDA_DISPLAY = 0x00000040;
  public const int ADL_DISPLAY_DISPLAYINFO_MODETIMING_OVERRIDESSUPPORTED = 0x00000080;
  public const int ADL_DISPLAY_DISPLAYINFO_MANNER_SUPPORTED_SINGLE = 0x00000100;
  public const int ADL_DISPLAY_DISPLAYINFO_MANNER_SUPPORTED_CLONE = 0x00000200;
  public const int ADL_DISPLAY_DISPLAYINFO_MANNER_SUPPORTED_NSTRETCH1HSTRETCH = 0x00000400;
  public const int ADL_DISPLAY_DISPLAYINFO_MANNER_SUPPORTED_NSTRETCH2HSTRETCH = 0x00000800;
  public const int ADL_DISPLAY_DISPLAYINFO_MANNER_SUPPORTED_EXTEND = 0x00001000;

  [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
  public delegate IntPtr AdlMallocCallback(int size);

  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL_Main_Control_Create(AdlMallocCallback callback, int iEnumConnectedAdapters);

  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL_Main_Control_Destroy();

  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL_Adapter_NumberOfAdapters_Get(out int lpNumAdapters);

  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL_Adapter_AdapterInfo_Get(IntPtr lpInfo, int iInputSize);

  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL_Adapter_Active_Get(int iAdapterIndex, out int lpStatus);

  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL_Display_DisplayInfo_Get(int iAdapterIndex, out int lpNumDisplays, out IntPtr lppInfo, int iForceDetect);

  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL_Display_ConnectedDisplays_Get(int iAdapterIndex, out int lpConnections);

  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL_Display_DDCInfo_Get(int iAdapterIndex, int iDisplayIndex, IntPtr lpInfo);

  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL_Display_WriteAndReadI2C(int iAdapterIndex, IntPtr plI2C);

  [DllImport("user32.dll")]
  public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);

  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX lpmi);

  [DllImport("dxva2.dll")]
  public static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, out uint pdwNumberOfPhysicalMonitors);

  [DllImport("dxva2.dll")]
  public static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint dwPhysicalMonitorArraySize, [Out] PHYSICAL_MONITOR[] pPhysicalMonitorArray);

  [DllImport("dxva2.dll")]
  public static extern bool DestroyPhysicalMonitors(uint dwPhysicalMonitorArraySize, PHYSICAL_MONITOR[] pPhysicalMonitorArray);

  [DllImport("dxva2.dll")]
  public static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr hMonitor, byte bVCPCode, out int pvct, out uint pdwCurrentValue, out uint pdwMaximumValue);

  [DllImport("dxva2.dll")]
  public static extern bool SetVCPFeature(IntPtr hMonitor, byte bVCPCode, uint dwNewValue);

  public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, IntPtr lprcMonitor, IntPtr dwData);

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct RECT { public int left, top, right, bottom; }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct MONITORINFOEX {
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string szDevice;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct PHYSICAL_MONITOR {
    public IntPtr hPhysicalMonitor;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string szPhysicalMonitorDescription;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct AdapterInfo {
    public int iSize;
    public int iAdapterIndex;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strUDID;
    public int iBusNumber;
    public int iDeviceNumber;
    public int iFunctionNumber;
    public int iVendorID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAdapterName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strDisplayName;
    public int iPresent;
    public int iExist;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strDriverPath;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strDriverPathExt;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strPNPString;
    public int iOSDisplayIndex;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct ADLDisplayID {
    public int iDisplayLogicalIndex;
    public int iDisplayPhysicalIndex;
    public int iDisplayLogicalAdapterIndex;
    public int iDisplayPhysicalAdapterIndex;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct ADLDisplayInfo {
    public ADLDisplayID displayID;
    public int iDisplayControllerIndex;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strDisplayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strDisplayManufacturerName;
    public int iDisplayType;
    public int iDisplayOutputType;
    public int iDisplayConnector;
    public int iDisplayInfoMask;
    public int iDisplayInfoValue;
  }

  static readonly AdlMallocCallback KeepMalloc = Alloc;
  public static IntPtr Alloc(int size) { return Marshal.AllocHGlobal(size); }

  public static string Run(bool force) {
    var sb = new StringBuilder();
    int rc = ADL_Main_Control_Create(KeepMalloc, 1);
    sb.AppendFormat("ADL_Main_Control_Create rc={0}\n", rc);
    if (rc != ADL_OK) return sb.ToString();
    try {
      int n;
      rc = ADL_Adapter_NumberOfAdapters_Get(out n);
      sb.AppendFormat("adapters rc={0} n={1} AdapterInfoSize={2}\n", rc, n, Marshal.SizeOf(typeof(AdapterInfo)));
      if (rc != ADL_OK || n <= 0) return sb.ToString();
      int sz = n * Marshal.SizeOf(typeof(AdapterInfo));
      IntPtr buf = Marshal.AllocHGlobal(sz);
      try {
        for (int i = 0; i < n; i++) {
          IntPtr p = IntPtr.Add(buf, i * Marshal.SizeOf(typeof(AdapterInfo)));
          Marshal.WriteInt32(p, Marshal.SizeOf(typeof(AdapterInfo)));
        }
        rc = ADL_Adapter_AdapterInfo_Get(buf, sz);
        sb.AppendFormat("AdapterInfo_Get rc={0}\n", rc);
        for (int i = 0; i < n; i++) {
          IntPtr p = IntPtr.Add(buf, i * Marshal.SizeOf(typeof(AdapterInfo)));
          var a = Marshal.PtrToStructure<AdapterInfo>(p);
          int active = -1;
          ADL_Adapter_Active_Get(a.iAdapterIndex, out active);
          sb.AppendFormat("ADAPT idx={0} present={1} exist={2} active={3} vendor={4} osDisp={5} name={6} display={7} pnp={8}\n",
            a.iAdapterIndex, a.iPresent, a.iExist, active, a.iVendorID, a.iOSDisplayIndex, a.strAdapterName, a.strDisplayName, a.strPNPString);
          int conn = 0;
          int crc = ADL_Display_ConnectedDisplays_Get(a.iAdapterIndex, out conn);
          sb.AppendFormat("  ConnectedDisplays rc={0} mask=0x{1:X}\n", crc, conn);
          int num = 0;
          IntPtr infos = IntPtr.Zero;
          int drc = ADL_Display_DisplayInfo_Get(a.iAdapterIndex, out num, out infos, force ? 1 : 0);
          sb.AppendFormat("  DisplayInfo force={0} rc={1} num={2}\n", force, drc, num);
          if (drc == ADL_OK && infos != IntPtr.Zero && num > 0) {
            int dsz = Marshal.SizeOf(typeof(ADLDisplayInfo));
            for (int d = 0; d < num; d++) {
              var di = Marshal.PtrToStructure<ADLDisplayInfo>(IntPtr.Add(infos, d * dsz));
              int v = di.iDisplayInfoValue;
              sb.AppendFormat("  DISP log={0} phy={1} type={2} out={3} conn={4} mask=0x{5:X} val=0x{6:X} connected={7} mapped={8} forceable={9} extend={10} name={11} mfr={12}\n",
                di.displayID.iDisplayLogicalIndex, di.displayID.iDisplayPhysicalIndex, di.iDisplayType, di.iDisplayOutputType, di.iDisplayConnector,
                di.iDisplayInfoMask, v, (v & 1) != 0, (v & 2) != 0, (v & 8) != 0, (v & 0x1000) != 0, di.strDisplayName, di.strDisplayManufacturerName);
            }
          }
        }
      } finally { Marshal.FreeHGlobal(buf); }
    } finally {
      try { ADL_Main_Control_Destroy(); } catch {}
    }
    return sb.ToString();
  }

  static StringBuilder _monSb;
  public static bool EnumCb(IntPtr hMon, IntPtr hdc, IntPtr rc, IntPtr data) {
    var mi = new MONITORINFOEX();
    mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
    GetMonitorInfo(hMon, ref mi);
    uint n = 0;
    bool ok = GetNumberOfPhysicalMonitorsFromHMONITOR(hMon, out n);
    _monSb.AppendFormat("HMONITOR device={0} flags={1} rect={2},{3}-{4},{5} physOk={6} n={7}\n",
      mi.szDevice, mi.dwFlags, mi.rcMonitor.left, mi.rcMonitor.top, mi.rcMonitor.right, mi.rcMonitor.bottom, ok, n);
    if (ok && n > 0) {
      var arr = new PHYSICAL_MONITOR[n];
      if (GetPhysicalMonitorsFromHMONITOR(hMon, n, arr)) {
        for (int i = 0; i < n; i++) {
          _monSb.AppendFormat("  PHYS {0} handle={1}\n", arr[i].szPhysicalMonitorDescription, arr[i].hPhysicalMonitor);
          foreach (byte code in new byte[] { 0xD6, 0x60, 0xAC, 0xAE, 0x10, 0x12 }) {
            int t; uint cur, max;
            bool g = GetVCPFeatureAndVCPFeatureReply(arr[i].hPhysicalMonitor, code, out t, out cur, out max);
            _monSb.AppendFormat("    VCP 0x{0:X2} ok={1} type={2} cur={3} max={4}\n", code, g, t, cur, max);
          }
        }
        DestroyPhysicalMonitors(n, arr);
      }
    }
    return true;
  }

  public static string DumpPhysical() {
    _monSb = new StringBuilder();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, EnumCb, IntPtr.Zero);
    return _monSb.ToString();
  }
}
'@

try {
  Add-Type -TypeDefinition $code -Language CSharp
  L('Add-Type ok')
} catch {
  L(('Add-Type err {0}' -f $_.Exception.ToString()))
  [IO.File]::WriteAllLines($log, $lines)
  Write-Output ('wrote ' + $log)
  exit 0
}

L('=== ADL no-force ===')
try { L([AdlProbe]::Run($false)) } catch { L(('adl err {0}' -f $_.Exception.ToString())) }

L('=== ADL force detect ===')
try { L([AdlProbe]::Run($true)) } catch { L(('adl force err {0}' -f $_.Exception.ToString())) }

L('=== physical monitors / DDC ===')
try { L([AdlProbe]::DumpPhysical()) } catch { L(('ddc err {0}' -f $_.Exception.ToString())) }

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
Write-Output ('wrote ' + $log)
