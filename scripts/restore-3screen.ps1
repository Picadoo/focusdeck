$log = 'D:\Tools\focusdeck\scripts\restore-3screen.log'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s) { $script:lines.Add($s) }

L(('started {0}' -f (Get-Date -Format o)))

$three = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Configuration\RTK22710_02_07E5_D2+BNQ78FFET7AR00103087_29_07E8_C0+XXX09700_14_07EA_46^AC80AD765D86757BD193B4652F7EFD8B'
$two = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Configuration\RTK22710_02_07E5_D2+XXX09700_14_07EA_46^A08436133E3169F3B9A86C2BDFA8110F'
$bnqOnly = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Configuration\BNQ78FFET7AR00103087_29_07E8_C0^E8AB52399F167933049207774BDA649D'
$bnqRtk = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Configuration\RTK22710_02_07E5_D2+BNQ78FFET7AR00103087_29_07E8_C0^79241633ABC406168B2282AACFBACF06'

function Dump-Cfg([string]$path, [string]$label) {
  L(("=== {0} exists={1} ===" -f $label, (Test-Path $path)))
  if (-not (Test-Path $path)) { return }
  $root = Get-ItemProperty $path -ErrorAction SilentlyContinue
  if ($root) {
    $root.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
      $v = $_.Value
      if ($v -is [byte[]]) { $v = ('bytes[{0}]' -f $v.Length) }
      elseif ($v -is [Array]) { $v = ($v -join ',') }
      L(('  ROOT {0}={1}' -f $_.Name, $v))
    }
  }
  Get-ChildItem $path -ErrorAction SilentlyContinue | ForEach-Object {
    L(('  SET {0}' -f $_.PSChildName))
    $sp = $_.PSPath
    $p = Get-ItemProperty $sp -ErrorAction SilentlyContinue
    if ($p) {
      foreach ($n in @('PrimSurfSize.cx','PrimSurfSize.cy','ActiveSize.cx','ActiveSize.cy','Position.cx','Position.cy','Attach.ToDesktop','DwmClipBox.left','DwmClipBox.top','DwmClipBox.right','DwmClipBox.bottom','Scaling','VidPNSrcId','Timestamp')) {
        if ($null -ne $p.$n) { L(('    {0}={1}' -f $n, $p.$n)) }
      }
    }
    Get-ChildItem $sp -ErrorAction SilentlyContinue | ForEach-Object {
      L(('    SUB {0}' -f $_.PSChildName))
      $cp = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      if ($cp) {
        foreach ($n in @('PrimSurfSize.cx','PrimSurfSize.cy','ActiveSize.cx','ActiveSize.cy','Position.cx','Position.cy','Attach.ToDesktop','Scaling')) {
          if ($null -ne $cp.$n) { L(('      {0}={1}' -f $n, $cp.$n)) }
        }
      }
    }
  }
}

Dump-Cfg $three 'THREE'
Dump-Cfg $two 'TWO'
Dump-Cfg $bnqOnly 'BNQONLY'
Dump-Cfg $bnqRtk 'BNQRTK'

L('=== Connectivity 3-screen ===')
$conn3 = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Connectivity\RTK22710_02_07E5_D2^XXX09700_14_07EA_46^BNQ78FFET7AR00103087_29_07E8_C0^333F68EE6583D0E421E158CE441C1898'
L(('exists={0}' -f (Test-Path $conn3)))
if (Test-Path $conn3) {
  Get-ChildItem $conn3 -Recurse -ErrorAction SilentlyContinue | Select-Object -First 40 | ForEach-Object {
    L(('  {0}' -f $_.Name))
    $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    if ($p) {
      $p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | Select-Object -First 20 | ForEach-Object {
        $v = $_.Value
        if ($v -is [byte[]]) { $v = ('bytes[{0}]' -f $v.Length) }
        L(('    {0}={1}' -f $_.Name, $v))
      }
    }
  }
}

L('=== MonitorDataStore BNQ ===')
$mds = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\MonitorDataStore'
if (Test-Path $mds) {
  Get-ChildItem $mds -ErrorAction SilentlyContinue | ForEach-Object {
    L(('MDS {0}' -f $_.PSChildName))
  }
}

L('=== InternalMonEdid ===')
$ime = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\InternalMonEdid'
if (Test-Path $ime) {
  Get-ChildItem $ime -ErrorAction SilentlyContinue | ForEach-Object { L(('IME {0}' -f $_.PSChildName)) }
}

L('=== AMD ADL / aticonfig / AMD Software ===')
@(
  'C:\Program Files\AMD\CNext\CNext\RadeonSoftware.exe',
  'C:\Program Files\AMD\CNext\CNext\AMDRSServ.exe',
  'C:\Windows\System32\cncmd.exe',
  'C:\Program Files\AMD\Performance Profile Client\AMDRyzenMasterDriver.sys'
) | ForEach-Object { L(('exists={0} {1}' -f (Test-Path $_), $_)) }

Get-ChildItem 'C:\Program Files\AMD' -ErrorAction SilentlyContinue | ForEach-Object { L(('AMDDIR {0}' -f $_.FullName)) }
Get-ChildItem 'C:\Program Files (x86)\AMD' -ErrorAction SilentlyContinue | ForEach-Object { L(('AMDx86 {0}' -f $_.FullName)) }

L('=== services related ===')
Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'AMD|Ati|ToDesk|Oray|Sunlogin|Idd' } | ForEach-Object {
  L(('SVC {0} {1} {2}' -f $_.Status, $_.Name, $_.DisplayName))
}

L('=== MultiPlane / CCD persisted topology via QueryDisplayConfig currentTopology ===')
$code = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class CcdRestore {
  public const uint QDC_DATABASE_CURRENT = 0x00000004;
  public const uint QDC_ALL_PATHS = 0x00000001;
  public const uint SDC_APPLY = 0x00000080;
  public const uint SDC_USE_DATABASE_CURRENT = 0x00000010;
  public const uint SDC_TOPOLOGY_EXTEND = 0x00000004;
  public const uint SDC_TOPOLOGY_CLONE = 0x00000002;
  public const uint SDC_TOPOLOGY_INTERNAL = 0x00000001;
  public const uint SDC_TOPOLOGY_EXTERNAL = 0x00000008;
  public const uint SDC_PATH_PERSIST_IF_REQUIRED = 0x00000800;
  public const uint SDC_FORCE_MODE_ENUMERATION = 0x00001000;
  public const uint SDC_ALLOW_PATH_ORDER_CHANGES = 0x00002000;
  public const uint SDC_VIRTUAL_MODE_AWARE = 0x00008000;
  public const uint SDC_SAVE_TO_DATABASE = 0x00000200;
  public const uint SDC_USE_SUPPLIED_DISPLAY_CONFIG = 0x00000020;
  public const uint SDC_ALLOW_CHANGES = 0x00000400;

  [StructLayout(LayoutKind.Sequential)]
  public struct LUID { public uint LowPart; public int HighPart; }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PATH_SOURCE_INFO {
    public LUID adapterId;
    public uint id;
    public uint modeInfoIdx;
    public uint statusFlags;
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct RATIONAL { public uint Numerator; public uint Denominator; }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PATH_TARGET_INFO {
    public LUID adapterId;
    public uint id;
    public uint modeInfoIdx;
    public int outputTechnology;
    public uint rotation;
    public uint scaling;
    public RATIONAL refreshRate;
    public uint scanLineOrdering;
    public int targetAvailable;
    public uint statusFlags;
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PATH_INFO {
    public PATH_SOURCE_INFO sourceInfo;
    public PATH_TARGET_INFO targetInfo;
    public uint flags;
  }

  [DllImport("user32.dll")]
  public static extern int GetDisplayConfigBufferSizes(uint flags, out uint numPathArrayElements, out uint numModeInfoArrayElements);

  [DllImport("user32.dll")]
  public static extern int QueryDisplayConfig(uint flags, ref uint numPathArrayElements, [In, Out] PATH_INFO[] pathArray, ref uint numModeInfoArrayElements, [In, Out] byte[] modeInfoArray, out int currentTopologyId);

  [DllImport("user32.dll")]
  public static extern int SetDisplayConfig(uint numPathArrayElements, PATH_INFO[] pathArray, uint numModeInfoArrayElements, byte[] modeInfoArray, uint flags);

  public static string DumpDb() {
    var sb = new StringBuilder();
    uint pathCount, modeCount;
    int rc = GetDisplayConfigBufferSizes(QDC_DATABASE_CURRENT, out pathCount, out modeCount);
    sb.AppendFormat("DB GetBuffer rc={0} paths={1} modes={2}\n", rc, pathCount, modeCount);
    if (rc != 0) return sb.ToString();
    var paths = new PATH_INFO[Math.Max(pathCount, 1)];
    var modes = new byte[Math.Max(modeCount, 1) * 64];
    int topo = 0;
    rc = QueryDisplayConfig(QDC_DATABASE_CURRENT, ref pathCount, paths, ref modeCount, modes, out topo);
    sb.AppendFormat("DB Query rc={0} paths={1} modes={2} topo={3}\n", rc, pathCount, modeCount, topo);
    for (int i = 0; i < pathCount; i++) {
      var p = paths[i];
      sb.AppendFormat("DBPATH {0} flags={1} srcId={2} tgtId={3} tech={4} avail={5} tgtFlags={6}\n", i, p.flags, p.sourceInfo.id, p.targetInfo.id, p.targetInfo.outputTechnology, p.targetInfo.targetAvailable, p.targetInfo.statusFlags);
    }
    return sb.ToString();
  }

  public static string TryDbCurrent() {
    int rc = SetDisplayConfig(0, null, 0, null, SDC_APPLY | SDC_USE_DATABASE_CURRENT | SDC_SAVE_TO_DATABASE | SDC_ALLOW_CHANGES);
    return "SetDisplayConfig USE_DATABASE_CURRENT rc=" + rc + "\n";
  }

  public static string TryForceEnum() {
    int rc = SetDisplayConfig(0, null, 0, null, SDC_APPLY | SDC_TOPOLOGY_EXTEND | SDC_FORCE_MODE_ENUMERATION | SDC_PATH_PERSIST_IF_REQUIRED | SDC_ALLOW_CHANGES);
    return "SetDisplayConfig EXTEND+FORCE_ENUM rc=" + rc + "\n";
  }
}
'@

try {
  Add-Type -TypeDefinition $code -Language CSharp
  L('Add-Type ok')
  L([CcdRestore]::DumpDb())
  L('=== USE_DATABASE_CURRENT ===')
  L([CcdRestore]::TryDbCurrent())
  Start-Sleep -Seconds 2
  L('=== FORCE ENUM EXTEND ===')
  L([CcdRestore]::TryForceEnum())
  Start-Sleep -Seconds 2
  L([CcdRestore]::DumpDb())
} catch {
  L(('CCD err {0}' -f $_.Exception.ToString()))
}

Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
L(('screenCount={0}' -f $screens.Length))
$i = 0
foreach ($s in $screens) {
  $b = $s.Bounds
  L(('SCREEN {0} name={1} primary={2} bounds={3},{4} {5}x{6}' -f $i, $s.DeviceName, $s.Primary, $b.X, $b.Y, $b.Width, $b.Height))
  $i++
}

Get-PnpDevice -Class Monitor -ErrorAction SilentlyContinue | ForEach-Object {
  L(('PNP {0} | {1} | {2} | {3}' -f $_.Status, $_.FriendlyName, $_.InstanceId, $_.Problem))
}

[IO.File]::WriteAllLines($log, $lines)
Write-Output ('wrote ' + $log)
