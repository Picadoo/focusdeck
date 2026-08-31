import { useEffect, useRef } from 'react'
import { useTimerStore } from '../../stores/timerStore'

export function TimerEngine() {
  const phase = useTimerStore((s) => s.phase)
  const endsAt = useTimerStore((s) => s.endsAt)
  const timeoutRef = useRef(0)

  useEffect(() => {
    function clear() {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = 0
    }

    function schedule() {
      clear()
      const state = useTimerStore.getState()
      if (!state.phase.endsWith('_running') || state.endsAt == null) return
      const delay = Math.max(32, state.endsAt * 1000 - Date.now())
      timeoutRef.current = window.setTimeout(() => {
        useTimerStore.getState().tick()
        schedule()
      }, delay)
    }

    function onVisible() {
      if (document.hidden) return
      useTimerStore.getState().tick()
      schedule()
    }

    schedule()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clear()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [endsAt, phase])

  return null
}
