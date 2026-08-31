import { useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useAuthStore } from '../../stores/authStore'
import { isApplyingRemote, resetSyncCursor, runSync, scheduleSync } from '../../lib/sync'
import { rescheduleDataReminders } from '../../lib/nativeReminders'

export function SyncEngine() {
  const session = useAuthStore((s) => s.session)

  useEffect(() => {
    if (!session) return
    void runSync(session).then((ok) => {
      if (ok) void rescheduleDataReminders()
    })
  }, [session])

  useEffect(() => {
    if (!session) return undefined
    const unsub = useAppStore.subscribe(() => {
      if (isApplyingRemote()) return
      scheduleSync(session)
    })
    return unsub
  }, [session])

  useEffect(() => {
    function onOnline() {
      const current = useAuthStore.getState().session
      if (current) void runSync(current).then((ok) => { if (ok) void rescheduleDataReminders() })
      else void rescheduleDataReminders()
    }
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      const current = useAuthStore.getState().session
      if (current) void runSync(current).then((ok) => { if (ok) void rescheduleDataReminders() })
      else void rescheduleDataReminders()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    if (session) return
    resetSyncCursor()
  }, [session])

  return null
}
