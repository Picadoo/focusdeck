package com.focusdeck.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 定时通知靠 AlarmManager 在应用不在前台时唤醒。荣耀 MagicOS / 华为 EMUI 默认会
 * 冻结未加白名单的应用并禁止自启，前面权限做得再对也不会响。WebView 里查不到这些
 * 系统状态、也拉不起厂商专有设置页，只能落到原生这一层。
 */
@CapacitorPlugin(name = "DeviceGuard")
public class DeviceGuardPlugin extends Plugin {

    /** 厂商自启动 / 启动管理页。HONOR 独立后包名从 huawei 迁到 hihonor，两个都要试。 */
    private static final String[][] AUTOSTART_TARGETS = {
        { "com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
        { "com.hihonor.systemmanager", "com.hihonor.systemmanager.optimize.process.ProtectActivity" },
        { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
        { "com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity" },
        { "com.huawei.systemmanager", "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity" },
        { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
        { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
        { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
    };

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("manufacturer", Build.MANUFACTURER);
        result.put("brand", Build.BRAND);
        result.put("sdkInt", Build.VERSION.SDK_INT);
        result.put("batteryOptimizationIgnored", isIgnoringBatteryOptimizations());
        result.put("autoStartSettingsAvailable", resolveAutoStartIntent() != null);
        result.put("vendorRestricted", isVendorRestricted());
        call.resolve(result);
    }

    /** 直接弹系统的「允许后台运行」对话框；不可用时退回电池优化列表页。 */
    @PluginMethod
    public void requestIgnoreBatteryOptimization(PluginCall call) {
        if (isIgnoringBatteryOptimizations()) {
            call.resolve(opened(true, "already_granted"));
            return;
        }
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        if (startIntent(intent)) {
            call.resolve(opened(true, "request_dialog"));
            return;
        }
        if (startIntent(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))) {
            call.resolve(opened(true, "battery_settings"));
            return;
        }
        call.resolve(opened(false, "unavailable"));
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        if (startIntent(intent)) {
            call.resolve(opened(true, "notification_settings"));
            return;
        }
        call.resolve(opened(startIntent(appDetailsIntent()), "app_details"));
    }

    @PluginMethod
    public void openAutoStartSettings(PluginCall call) {
        Intent intent = resolveAutoStartIntent();
        if (intent != null && startIntent(intent)) {
            call.resolve(opened(true, "vendor_autostart"));
            return;
        }
        call.resolve(opened(startIntent(appDetailsIntent()), "app_details"));
    }

    @PluginMethod
    public void openAppDetails(PluginCall call) {
        call.resolve(opened(startIntent(appDetailsIntent()), "app_details"));
    }

    private JSObject opened(boolean ok, String via) {
        JSObject result = new JSObject();
        result.put("opened", ok);
        result.put("via", via);
        return result;
    }

    private boolean isIgnoringBatteryOptimizations() {
        PowerManager manager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (manager == null) return false;
        return manager.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private boolean isVendorRestricted() {
        String brand = (Build.BRAND == null ? "" : Build.BRAND).toLowerCase();
        String manufacturer = (Build.MANUFACTURER == null ? "" : Build.MANUFACTURER).toLowerCase();
        String probe = brand + " " + manufacturer;
        return probe.contains("honor")
            || probe.contains("huawei")
            || probe.contains("xiaomi")
            || probe.contains("redmi")
            || probe.contains("oppo")
            || probe.contains("vivo")
            || probe.contains("realme")
            || probe.contains("meizu");
    }

    private Intent appDetailsIntent() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        return intent;
    }

    private Intent resolveAutoStartIntent() {
        for (String[] target : AUTOSTART_TARGETS) {
            Intent intent = new Intent();
            intent.setComponent(new ComponentName(target[0], target[1]));
            if (intent.resolveActivity(getContext().getPackageManager()) != null) return intent;
        }
        return null;
    }

    private boolean startIntent(Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            return true;
        } catch (Exception error) {
            return false;
        }
    }
}
