import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TimerState, TimerPhase } from '../types'
import { DEFAULT_TIMER_PROFILES, DEFAULT_TIMER_STATE } from '../lib/data'

interface TimerStore extends TimerState {
  setProfile: (profileId: string) => void
  start: (taskId?: string | null) => void
  pause: () => void
  resume: () => void
  skip: () => void
  reset: () => void
  tick: () => void
}

function currentSeconds() {
  return Math.floor(Date.now() / 1000)
}

function getPhaseDuration(profileId: string, phase: TimerPhase) {
  const profile = DEFAULT_TIMER_PROFILES.find((p) => p.id === profileId) ?? DEFAULT_TIMER_PROFILES[0]
  if (phase === 'focus_running' || phase === 'focus_paused') return profile.focusSeconds
  if (phase === 'short_break_running') return profile.shortBreakSeconds
  if (phase === 'long_break_running') return profile.longBreakSeconds
  return profile.focusSeconds
}

function nextPhase(profileId: string, current: TimerPhase, sessionCount: number): TimerPhase {
  const profile = DEFAULT_TIMER_PROFILES.find((p) => p.id === profileId) ?? DEFAULT_TIMER_PROFILES[0]
  if (current === 'focus_running' || current === 'focus_paused') {
    const nextSession = sessionCount + 1
    if (nextSession % profile.sessionsBeforeLongBreak === 0) return 'long_break_running'
    return 'short_break_running'
  }
  return 'focus_running'
}

export const useTimerStore = create(
  persist<TimerStore>(
    (set, get) => ({
      ...DEFAULT_TIMER_STATE,

      setProfile: (profileId) => {
        const profile = DEFAULT_TIMER_PROFILES.find((p) => p.id === profileId) ?? DEFAULT_TIMER_PROFILES[0]
        set({
          profileId,
          phase: 'idle',
          remainingSeconds: profile.focusSeconds,
          sessionCount: 0,
          startedAt: null,
          endsAt: null,
        })
      },

      start: (taskId = null) => {
        const state = get()
        const duration = getPhaseDuration(state.profileId, 'focus_running')
        const now = currentSeconds()
        const nextTaskId = taskId !== undefined ? taskId : state.taskId
        set({
          phase: 'focus_running',
          remainingSeconds: duration,
          taskId: nextTaskId,
          sessionCount: state.phase === 'idle' ? state.sessionCount : state.sessionCount,
          startedAt: now,
          endsAt: now + duration,
        })
      },

      pause: () => {
        const state = get()
        if (state.phase !== 'focus_running' && state.phase !== 'short_break_running' && state.phase !== 'long_break_running') return
        const now = currentSeconds()
        const remaining = Math.max(0, (state.endsAt ?? now) - now)
        set({ phase: `${state.phase.split('_running')[0]}_paused` as TimerPhase, remainingSeconds: remaining, endsAt: null })
      },

      resume: () => {
        const state = get()
        if (!state.phase.endsWith('_paused')) return
        const basePhase = state.phase.replace('_paused', '_running') as TimerPhase
        const now = currentSeconds()
        set({
          phase: basePhase,
          startedAt: now,
          endsAt: now + state.remainingSeconds,
        })
      },

      skip: () => {
        const state = get()
        if (state.phase === 'idle') return
        const profile = DEFAULT_TIMER_PROFILES.find((p) => p.id === state.profileId) ?? DEFAULT_TIMER_PROFILES[0]
        const next = nextPhase(state.profileId, state.phase, state.sessionCount)
        const newSessionCount = state.phase.startsWith('focus') ? state.sessionCount + 1 : state.sessionCount
        const duration = next === 'focus_running' ? profile.focusSeconds : next === 'short_break_running' ? profile.shortBreakSeconds : profile.longBreakSeconds
        const now = currentSeconds()
        set({
          phase: next,
          remainingSeconds: duration,
          sessionCount: newSessionCount,
          startedAt: now,
          endsAt: now + duration,
        })
      },

      reset: () => {
        const profile = DEFAULT_TIMER_PROFILES.find((p) => p.id === get().profileId) ?? DEFAULT_TIMER_PROFILES[0]
        set({
          ...DEFAULT_TIMER_STATE,
          profileId: get().profileId,
          remainingSeconds: profile.focusSeconds,
          taskId: get().taskId,
        })
      },

      tick: () => {
        const state = get()
        if (state.phase.endsWith('_paused') || state.phase === 'idle') return
        const now = currentSeconds()
        const ends = state.endsAt ?? now
        const remaining = Math.max(0, ends - now)

        if (remaining === 0) {
          // Auto advance
          const profile = DEFAULT_TIMER_PROFILES.find((p) => p.id === state.profileId) ?? DEFAULT_TIMER_PROFILES[0]
          const isFocus = state.phase === 'focus_running'
          const next = isFocus ? nextPhase(state.profileId, state.phase, state.sessionCount) : 'focus_running'
          const newSessionCount = isFocus ? state.sessionCount + 1 : state.sessionCount
          const duration = next === 'focus_running' ? profile.focusSeconds : next === 'short_break_running' ? profile.shortBreakSeconds : profile.longBreakSeconds
          set({
            phase: next,
            remainingSeconds: duration,
            sessionCount: newSessionCount,
            startedAt: now,
            endsAt: now + duration,
          })
        } else {
          set({ remainingSeconds: remaining })
        }
      },
    }),
    {
      name: 'focusdeck-timer-storage',
      version: 1,
    }
  )
)
