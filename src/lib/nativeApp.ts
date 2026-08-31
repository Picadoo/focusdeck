import { Capacitor } from '@capacitor/core'
import { t } from '../i18n/messages'
import { useAuthStore } from '../stores/authStore'
import { useUIStore } from '../stores/uiStore'
import { runSync } from './sync'
import { closeTopOverlay } from './overlayStack'
import { rescheduleDataReminders, scheduleTimerReminder } from './nativeReminders'
import { useTimerStore } from '../stores/timerStore'

export async function initNativeChrome() {
  if (!Capacitor.isNativePlatform()) return
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  await Promise.all([
    StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined),
    StatusBar.setBackgroundColor({ color: '#ffffff' }).catch(() => undefined),
  ])
}

export function bindNativeAppListeners(handlers: {
  closeNav: () => boolean
  goHomeFromTimer: () => boolean
}) {
  if (!Capacitor.isNativePlatform()) return () => undefined

  let cancelled = false
  const cleanups: Array<() => void> = []

  void (async () => {
    const [{ App: CapApp }, { Network }] = await Promise.all([
      import('@capacitor/app'),
      import('@capacitor/network'),
    ])
    if (cancelled) return

    async function track(handlePromise: Promise<{ remove: () => Promise<void> }>) {
      const handle = await handlePromise
      if (cancelled) {
        void handle.remove()
        return
      }
      cleanups.push(() => { void handle.remove() })
    }

    await Promise.all([
      track(CapApp.addListener('backButton', ({ canGoBack }) => {
        if (handlers.closeNav()) return
        if (closeTopOverlay()) return
        if (handlers.goHomeFromTimer()) return
        if (canGoBack) window.history.back()
        else void CapApp.minimizeApp()
      })),
      track(CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) return
        const session = useAuthStore.getState().session
        if (session) void runSync(session).then((ok) => { if (ok) void rescheduleDataReminders() })
        else void rescheduleDataReminders()
        const timer = useTimerStore.getState()
        void scheduleTimerReminder(timer.phase.endsWith('_running') ? timer.endsAt : null)
      })),
      track(Network.addListener('networkStatusChange', (status) => {
        if (!status.connected) return
        const session = useAuthStore.getState().session
        if (session) void runSync(session).then((ok) => { if (ok) void rescheduleDataReminders() })
      })),
    ])
  })()

  return () => {
    cancelled = true
    for (const cleanup of cleanups) cleanup()
  }
}

export function oemBatteryHint() {
  if (!Capacitor.isNativePlatform() || !useUIStore.getState().notifyEnabled) return ''
  return t('sync.battery.hint')
}
