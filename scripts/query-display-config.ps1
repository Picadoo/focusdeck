$log = 'D:\Tools\focusdeck\scripts\query-display-config.log'
$code = @'
using System;
using System.Runtime.InteropServices;

public static class Ccd {
  public const int QDC_ALL_PATHS = 0x00000001;
  public const int QDC_ONLY_ACTIVE_PATHS = 0x00000002;
  public const int SDC_APPLY = 0x00000080;
  public const int SDC_USE_SUPPLIED_DISPLAY_CONFIG = 0x00000020;
  public const int SDC_ALLOW_CHANGES = 0x00000400;
  public const int SDC_SAVE_TO_DATABASE = 0x00000200;
  public const int SDC_TOPOLOGY_EXTEND = 0x00000004;

  [StructLayout(LayoutKind.Sequential)]
  public struct LUID { public uint LowPart; public int HighPart; }

  [StructLayout(LayoutKind.Sequential)]
  public struct DISPLAYCONFIG_PATH_SOURCE_INFO {
    public LUID adapterId;
    public uint id;
    public uint modeInfoIdx;
    public uint statusFlags;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct DISPLAYCONFIG_PATH_TARGET_INFO {
    public LUID adapterId;
    public uint id;
    public uint modeInfoIdx;
    public uint outputTechnology;
    public uint rotation;
    public uint scaling;
    public ulong refreshRate;
    public uint scanLineOrdering;
    public int targetAvailable;
    public uint statusFlags;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct DISPLAYCONFIG_PATH_INFO {
    public DISPLAYCONFIG_PATH_SOURCE_INFO sourceInfo;
    public DISPLAYCONFIG_PATH_TARGET_INFO targetInfo;
    public uint flags;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct DISPLAYCONFIG_RATIONAL {
    public uint Numerator;
    public uint Denominator;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct DISPLAYCONFIG_2DREGION {
    public uint cx;
    public uint cy;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct DISPLAYCONFIG_VIDEO_SIGNAL_INFO {
    public ulong pixelRate;
    public DISPLAYCONFIG_RATIONAL hSyncFreq;
    public DISPLAYCONFIG_RATIONAL vSyncFreq;
    public DISPLAYCONFIG_2DREGION activeSize;
    public DISPLAYCONFIG_2DREGION totalSize;
    public uint videoStandard;
    public uint scanLineOrdering;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct DISPLAYCONFIG_TARGET_MODE {
    public DISPLAYCONFIG_VIDEO_SIGNAL_INFO targetVideoSignalInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct POINTL { public int x; public int y; }

  [StructLayout(LayoutKind.Sequential)]
  public struct DISPLAYCONFIG_SOURCE_MODE {
    public uint width;
    public uint height;
    public uint pixelFormat;
    public POINTL position;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct DISPLAYCONFIG_MODE_INFO_UNION {
    [FieldOffset(0)] public DISPLAYCONFIG_TARGET_MODE targetMode;
    [FieldOffset(0)] public DISPLAYCONFIG_SOURCE_MODE sourceMode;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct DISPLAYCONFIG_MODE_INFO {
    public uint infoType;
    public uint id;
    public LUID adapterId;
    public DISPLAYCONFIG_MODE_INFO_UNION info;
  }

  [DllImport("user32.dll")]
  public static extern int GetDisplayConfigBufferSizes(uint flags, out uint numPathArrayElements, out uint numModeInfoArrayElements);

  [DllImport("user32.dll")]
  public static extern int QueryDisplayConfig(uint flags, ref uint numPathArrayElements, [Out] DISPLAYCONFIG_PATH_INFO[] pathArray, ref uint numModeInfoArrayElements, [Out] DISPLAYCONFIG_MODE_INFO[] modeInfoArray, IntPtr currentTopologyId);

  [DllImport("user32.dll")]
  public static extern int SetDisplayConfig(uint numPathArrayElements, DISPLAYCONFIG_PATH_INFO[] pathArray, uint numModeInfoArrayElements, DISPLAYCONFIG_MODE_INFO[] modeInfoArray, uint flags);
}
'@
Add-Type -TypeDefinition $code

$lines = New-Object System.Collections.Generic.List[string]
$pathCount = [uint32]0
$modeCount = [uint32]0
$rc = [Ccd]::GetDisplayConfigBufferSizes(1, [ref]$pathCount, [ref]$modeCount)
$lines.Add(("GetDisplayConfigBufferSizes rc={0} paths={1} modes={2}" -f $rc, $pathCount, $modeCount))
if ($rc -eq 0 -and $pathCount -gt 0) {
  $paths = New-Object 'Ccd+DISPLAYCONFIG_PATH_INFO[]' $pathCount
  $modes = New-Object 'Ccd+DISPLAYCONFIG_MODE_INFO[]' $modeCount
  $rc2 = [Ccd]::QueryDisplayConfig(1, [ref]$pathCount, $paths, [ref]$modeCount, $modes, [IntPtr]::Zero)
  $lines.Add(("QueryDisplayConfig rc={0} paths={1} modes={2}" -f $rc2, $pathCount, $modeCount))
  for ($i = 0; $i -lt $pathCount; $i++) {
    $p = $paths[$i]
    $lines.Add(("PATH {0} flags={1} srcId={2} tgtId={3} tech={4} available={5} tgtFlags={6} srcFlags={7} srcModeIdx={8} tgtModeIdx={9}" -f $i, $p.flags, $p.sourceInfo.id, $p.targetInfo.id, $p.targetInfo.outputTechnology, $p.targetInfo.targetAvailable, $p.targetInfo.statusFlags, $p.sourceInfo.statusFlags, $p.sourceInfo.modeInfoIdx, $p.targetInfo.modeInfoIdx))
  }
  for ($i = 0; $i -lt $modeCount; $i++) {
    $m = $modes[$i]
    if ($m.infoType -eq 1) {
      $lines.Add(("MODE {0} SOURCE id={1} {2}x{3} pos={4},{5}" -f $i, $m.id, $m.info.sourceMode.width, $m.info.sourceMode.height, $m.info.sourceMode.position.x, $m.info.sourceMode.position.y))
    } elseif ($m.infoType -eq 2) {
      $sz = $m.info.targetMode.targetVideoSignalInfo.activeSize
      $lines.Add(("MODE {0} TARGET id={1} {2}x{3}" -f $i, $m.id, $sz.cx, $sz.cy))
    } else {
      $lines.Add(("MODE {0} type={1} id={2}" -f $i, $m.infoType, $m.id))
    }
  }
}
[IO.File]::WriteAllLines($log, $lines)
Write-Output "wrote $log"
