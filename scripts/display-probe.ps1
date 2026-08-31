$log = 'D:\Tools\focusdeck\scripts\display-probe.log'
$code = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class DisplayProbe {
  public const uint QDC_ALL_PATHS = 0x00000001;
  public const uint QDC_ONLY_ACTIVE_PATHS = 0x00000002;
  public const uint DISPLAYCONFIG_PATH_ACTIVE = 0x00000001;
  public const uint SDC_TOPOLOGY_EXTEND = 0x00000004;
  public const uint SDC_USE_SUPPLIED_DISPLAY_CONFIG = 0x00000020;
  public const uint SDC_APPLY = 0x00000080;
  public const uint SDC_SAVE_TO_DATABASE = 0x00000200;
  public const uint SDC_ALLOW_CHANGES = 0x00000400;
  public const uint SDC_VIRTUAL_MODE_AWARE = 0x00008000;

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

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct REGION { public uint cx; public uint cy; }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct VIDEO_SIGNAL_INFO {
    public ulong pixelRate;
    public RATIONAL hSyncFreq;
    public RATIONAL vSyncFreq;
    public REGION activeSize;
    public REGION totalSize;
    public uint videoStandard;
    public uint scanLineOrdering;
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct POINTL { public int x; public int y; }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct SOURCE_MODE {
    public uint width;
    public uint height;
    public uint pixelFormat;
    public POINTL position;
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct TARGET_MODE {
    public VIDEO_SIGNAL_INFO targetVideoSignalInfo;
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct MODE_INFO {
    public uint infoType;
    public uint id;
    public LUID adapterId;
    public TARGET_MODE targetMode;
    public uint pad0;
    public uint pad1;
    public uint pad2;
    public uint pad3;
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct DEVICE_INFO_HEADER {
    public int type;
    public int size;
    public LUID adapterId;
    public uint id;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode, Pack = 4)]
  public struct TARGET_DEVICE_NAME {
    public DEVICE_INFO_HEADER header;
    public uint flags;
    public int outputTechnology;
    public ushort edidManufactureId;
    public ushort edidProductCodeId;
    public uint connectorInstance;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
    public string monitorFriendlyDeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string monitorDevicePath;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode, Pack = 4)]
  public struct SOURCE_DEVICE_NAME {
    public DEVICE_INFO_HEADER header;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string viewGdiDeviceName;
  }

  [DllImport("user32.dll")]
  public static extern int GetDisplayConfigBufferSizes(uint flags, out uint numPathArrayElements, out uint numModeInfoArrayElements);

  [DllImport("user32.dll")]
  public static extern int QueryDisplayConfig(uint flags, ref uint numPathArrayElements, [In, Out] PATH_INFO[] pathArray, ref uint numModeInfoArrayElements, [In, Out] byte[] modeInfoArray, IntPtr currentTopologyId);

  [DllImport("user32.dll")]
  public static extern int SetDisplayConfig(uint numPathArrayElements, PATH_INFO[] pathArray, uint numModeInfoArrayElements, byte[] modeInfoArray, uint flags);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int DisplayConfigGetDeviceInfo(ref TARGET_DEVICE_NAME requestPacket);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int DisplayConfigGetDeviceInfo(ref SOURCE_DEVICE_NAME requestPacket);

  public static string Dump(uint flags) {
    var sb = new StringBuilder();
    uint pathCount, modeCount;
    int rc = GetDisplayConfigBufferSizes(flags, out pathCount, out modeCount);
    sb.AppendFormat("GetBuffer flags={0} rc={1} paths={2} modes={3} PATH_INFO={4}\n", flags, rc, pathCount, modeCount, Marshal.SizeOf(typeof(PATH_INFO)));
    if (rc != 0 || pathCount == 0) return sb.ToString();
    var paths = new PATH_INFO[pathCount];
    var modes = new byte[modeCount * 64];
    rc = QueryDisplayConfig(flags, ref pathCount, paths, ref modeCount, modes, IntPtr.Zero);
    sb.AppendFormat("Query rc={0} paths={1} modes={2}\n", rc, pathCount, modeCount);
    if (rc != 0) return sb.ToString();
    for (int i = 0; i < pathCount; i++) {
      var p = paths[i];
      string tname = "";
      string sname = "";
      try {
        var tn = new TARGET_DEVICE_NAME();
        tn.header.type = 2;
        tn.header.size = Marshal.SizeOf(typeof(TARGET_DEVICE_NAME));
        tn.header.adapterId = p.targetInfo.adapterId;
        tn.header.id = p.targetInfo.id;
        if (DisplayConfigGetDeviceInfo(ref tn) == 0) tname = (tn.monitorFriendlyDeviceName ?? "") + " | " + (tn.monitorDevicePath ?? "");
        var sn = new SOURCE_DEVICE_NAME();
        sn.header.type = 1;
        sn.header.size = Marshal.SizeOf(typeof(SOURCE_DEVICE_NAME));
        sn.header.adapterId = p.sourceInfo.adapterId;
        sn.header.id = p.sourceInfo.id;
        if (DisplayConfigGetDeviceInfo(ref sn) == 0) sname = sn.viewGdiDeviceName ?? "";
      } catch (Exception ex) { tname = "err:" + ex.Message; }
      sb.AppendFormat("PATH {0} active={1} srcId={2} tgtId={3} tech={4} available={5} tgtFlags={6} srcFlags={7} src={8} tgt={9}\n",
        i, (p.flags & 1) != 0, p.sourceInfo.id, p.targetInfo.id, p.targetInfo.outputTechnology, p.targetInfo.targetAvailable, p.targetInfo.statusFlags, p.sourceInfo.statusFlags, sname, tname);
    }
    return sb.ToString();
  }

  public static string TryExtend() {
    int rc = SetDisplayConfig(0, null, 0, null, SDC_APPLY | SDC_TOPOLOGY_EXTEND);
    return "SetDisplayConfig TOPOLOGY_EXTEND rc=" + rc + "\n";
  }

  public static string TryEnableInactive() {
    var sb = new StringBuilder();
    uint pathCount, modeCount;
    int rc = GetDisplayConfigBufferSizes(QDC_ALL_PATHS, out pathCount, out modeCount);
    sb.AppendFormat("enable GetBuffer rc={0} paths={1} modes={2}\n", rc, pathCount, modeCount);
    if (rc != 0) return sb.ToString();
    var paths = new PATH_INFO[pathCount];
    var modes = new byte[Math.Max(modeCount, 1) * 64];
    rc = QueryDisplayConfig(QDC_ALL_PATHS, ref pathCount, paths, ref modeCount, modes, IntPtr.Zero);
    sb.AppendFormat("enable Query rc={0} paths={1}\n", rc, pathCount);
    if (rc != 0) return sb.ToString();

    var selected = new List<PATH_INFO>();
    var seenActiveTargets = new HashSet<string>();
    var seenSources = new HashSet<uint>();
    for (int i = 0; i < pathCount; i++) {
      var p = paths[i];
      if ((p.flags & DISPLAYCONFIG_PATH_ACTIVE) != 0) {
        selected.Add(p);
        seenActiveTargets.Add(p.targetInfo.adapterId.LowPart + ":" + p.targetInfo.id);
        seenSources.Add(p.sourceInfo.id);
      }
    }
    int added = 0;
    for (int i = 0; i < pathCount; i++) {
      var p = paths[i];
      if ((p.flags & DISPLAYCONFIG_PATH_ACTIVE) != 0) continue;
      if (p.targetInfo.targetAvailable == 0) continue;
      string key = p.targetInfo.adapterId.LowPart + ":" + p.targetInfo.id;
      if (seenActiveTargets.Contains(key)) continue;
      p.flags = DISPLAYCONFIG_PATH_ACTIVE;
      p.sourceInfo.modeInfoIdx = 0xFFFFFFFF;
      p.targetInfo.modeInfoIdx = 0xFFFFFFFF;
      selected.Add(p);
      seenActiveTargets.Add(key);
      added++;
      sb.AppendFormat("would-enable tgtId={0} tech={1} srcId={2}\n", p.targetInfo.id, p.targetInfo.outputTechnology, p.sourceInfo.id);
    }
    if (added == 0) {
      sb.AppendLine("no inactive available targets");
      return sb.ToString();
    }
    var arr = selected.ToArray();
    uint flags = SDC_APPLY | SDC_USE_SUPPLIED_DISPLAY_CONFIG | SDC_ALLOW_CHANGES | SDC_SAVE_TO_DATABASE | SDC_VIRTUAL_MODE_AWARE;
    rc = SetDisplayConfig((uint)arr.Length, arr, 0, null, flags);
    sb.AppendFormat("SetDisplayConfig enable rc={0} selected={1}\n", rc, arr.Length);
    return sb.ToString();
  }
}
'@

$lines = New-Object System.Collections.Generic.List[string]
try {
  Add-Type -TypeDefinition $code -Language CSharp
  $lines.Add('Add-Type ok')
  $lines.Add('=== ACTIVE ===')
  $lines.Add([DisplayProbe]::Dump(2))
  $lines.Add('=== ALL ===')
  $lines.Add([DisplayProbe]::Dump(1))
  $lines.Add('=== EXTEND ===')
  $lines.Add([DisplayProbe]::TryExtend())
  Start-Sleep -Seconds 2
  $lines.Add('=== ENABLE INACTIVE ===')
  $lines.Add([DisplayProbe]::TryEnableInactive())
  Start-Sleep -Seconds 2
  $lines.Add('=== ACTIVE AFTER ===')
  $lines.Add([DisplayProbe]::Dump(2))
} catch {
  $lines.Add(('ERROR ' + $_.Exception.ToString()))
}

Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
$lines.Add(('screenCount=' + $screens.Length))
$i = 0
foreach ($s in $screens) {
  $b = $s.Bounds
  $lines.Add(('SCREEN {0} name={1} primary={2} bounds={3},{4} {5}x{6}' -f $i, $s.DeviceName, $s.Primary, $b.X, $b.Y, $b.Width, $b.Height))
  $i++
}

Get-PnpDevice -Class Monitor -ErrorAction SilentlyContinue | ForEach-Object {
  $lines.Add(('PNP {0} | {1} | {2}' -f $_.Status, $_.FriendlyName, $_.InstanceId))
}

[IO.File]::WriteAllLines($log, $lines)
Write-Output ("wrote " + $log)
