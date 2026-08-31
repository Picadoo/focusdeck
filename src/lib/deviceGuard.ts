import { Capacitor, registerPlugin } from '@capacitor/core'

export interface DeviceGuardStatus {
  manufacturer: string
  brand: string
  sdkInt: number
  batteryOptimizationIgnored: boolean
  autoStartSettingsAvailable: boolean
  /** 厂商 ROM 是否属于已知会冻结后台的那一类（荣耀 / 华为 / 小米 / OPPO / vivo 等）。 */
  vendorRestricted: boolean
}

export interface OpenResult {
  opened: boolean
  via: string
}

interface DeviceGuardPlugin {
  getStatus(): Promise<DeviceGuardStatus>
  requestIgnoreBatteryOptimization(): Promise<OpenResult>
  openNotificationSettings(): Promise<OpenResult>
  openAutoStartSettings(): Promise<OpenResult>
  openAppDetails(): Promise<OpenResult>
}

const plugin = registerPlugin<DeviceGuardPlugin>('DeviceGuard')

export function isDeviceGuardAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('DeviceGuard')
}

export async function getDeviceGuardStatus(): Promise<DeviceGuardStatus | null> {
  if (!isDeviceGuardAvailable()) return null
  try {
    return await plugin.getStatus()
  } catch {
    return null
  }
}

async function invoke(action: keyof Omit<DeviceGuardPlugin, 'getStatus'>): Promise<OpenResult> {
  if (!isDeviceGuardAvailable()) return { opened: false, via: 'unavailable' }
  try {
    return await plugin[action]()
  } catch {
    return { opened: false, via: 'error' }
  }
}

export const requestIgnoreBatteryOptimization = () => invoke('requestIgnoreBatteryOptimization')
export const openNotificationSettings = () => invoke('openNotificationSettings')
export const openAutoStartSettings = () => invoke('openAutoStartSettings')
export const openAppDetails = () => invoke('openAppDetails')
