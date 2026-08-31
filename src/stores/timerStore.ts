import { useNowSeconds } from '../lib/clock'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TimerPhase, TimerState, TimerTransition } from '../types'
import { defaultTimerProfiles, DEFAULT_TIMER_STATE } from '../lib/data'
import { useAppStore } from './appStore'

interface TimerStore extends TimerState {
  setProfile: (profileId: string) => void
  setTask: (taskId: string | null) => void
  refreshIdleDuration: () => void
  clearTransition: () => void
  start: (taskId?: string | null) => void
  pause: () => void
  resume: () => void
  skip: () => void
  reset: () => void
  tick: () => void
}

type PersistedTimerState = TimerState

function currentSeconds() {
  return Math.floor(Date.now() / 1000)
}

function getProfile(profileId: string) {
  const stored = useAppStore.getState().timerProfiles.find((profile) => profile.id === profileId)
  if (stored) return stored
  const seeds = defaultTimerProfiles()
  return seeds.find((profile) => profile.id === profileId) ?? seeds[0]
}

function getPhaseDuration(profileId: string, phase: TimerPhase) {
  const profile = getProfile(profileId)
  if (phase === 'short_break_running') return profile.shortBreakSeconds
  if (phase === 'long_break_running') return profile.longBreakSeconds
  return profile.focusSeconds
}

function getBreakPhase(profileId: string, sessionCount: number): TimerPhase {
  const profile = getProfile(profileId)
  return sessionCount % profile.sessionsBeforeLongBreak === 0 ? 'long_break_running' : 'short_break_running'
}

function creditCurrentFocusSegment(state: TimerStore, now: number) {
  if (!state.taskId || !state.phase.startsWith('focus')) return 0

  const profile = getProfile(state.profileId)
  const elapsed = Math.max(0, now - (state.startedAt ?? now))
  const remainingCredit = Math.max(0, profile.focusSeconds - state.focusElapsedSeconds)
  const credit = Math.min(elapsed, remainingCredit)
  if (credit > 0) useAppStore.getState().addFocusSeconds(state.taskId, credit)
  return credit
}

function remainingFromEndsAt(endsAt: number | null, now = currentSeconds()) {
  if (endsAt == null) return 0
  return Math.max(0, endsAt - now)
}

export const useTimerStore = create(
  persist<TimerStore>(
    (set, get) => ({
      ...DEFAULT_TIMER_STATE,

      setProfile: (profileId) => {
        const profile = getProfile(profileId)
        set({
          profileId,
          phase: 'idle',
          remainingSeconds: profile.focusSeconds,
          sessionCount: 0,
          taskId: null,
          startedAt: null,
          endsAt: null,
          focusElapsedSeconds: 0,
          lastTransition: null,
          lastTransitionAt: null,
        })
      },

      setTask: (taskId) => {
        if (get().phase !== 'idle') return
        set({ taskId })
      },

      refreshIdleDuration: () => {
        const state = get()
        if (state.phase !== 'idle') return
        set({ remainingSeconds: getProfile(state.profileId).focusSeconds })
      },

      clearTransition: () => set({ lastTransition: null, lastTransitionAt: null }),

      start: (taskId) => {
        const state = get()
        const duration = getPhaseDuration(state.profileId, 'focus_running')
        const now = currentSeconds()
        const nextTaskId = taskId !== undefined ? taskId : state.taskId
        set({
          phase: 'focus_running',
          remainingSeconds: duration,
          taskId: nextTaskId,
          startedAt: now,
          endsAt: now + duration,
          focusElapsedSeconds: 0,
          lastTransition: null,
          lastTransitionAt: null,
        })
      },

      pause: () => {
        const state = get()
        if (!state.phase.endsWith('_running')) return

        const now = currentSeconds()
        const credited = creditCurrentFocusSegment(state, now)
        const remaining = remainingFromEndsAt(state.endsAt, now)
        set({
          phase: `${state.phase.split('_running')[0]}_paused` as TimerPhase,
          remainingSeconds: remaining,
          endsAt: null,
          focusElapsedSeconds: state.focusElapsedSeconds + credited,
        })
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

        const now = currentSeconds()
        const profile = getProfile(state.profileId)
        if (state.phase.startsWith('focus')) {
          const credited = creditCurrentFocusSegment(state, now)
          set({
            phase: 'short_break_running',
            remainingSeconds: profile.shortBreakSeconds,
            taskId: null,
            startedAt: now,
            endsAt: now + profile.shortBreakSeconds,
            focusElapsedSeconds: state.focusElapsedSeconds + credited,
            lastTransition: 'focus_skipped',
            lastTransitionAt: now,
          })
          return
        }

        set({
          phase: 'idle',
          remainingSeconds: profile.focusSeconds,
          taskId: null,
          startedAt: null,
          endsAt: null,
          focusElapsedSeconds: 0,
          lastTransition: 'break_skipped',
          lastTransitionAt: now,
        })
      },

      reset: () => {
        const state = get()
        const profile = getProfile(state.profileId)
        set({
          ...DEFAULT_TIMER_STATE,
          profileId: state.profileId,
          remainingSeconds: profile.focusSeconds,
          taskId: state.taskId,
        })
      },

      tick: () => {
        const state = get()
        if (state.phase === 'idle' || state.phase.endsWith('_paused')) return

        const now = currentSeconds()
        const remaining = remainingFromEndsAt(state.endsAt, now)
        if (remaining > 0) return

        const profile = getProfile(state.profileId)
        if (state.phase === 'focus_running') {
          const credited = creditCurrentFocusSegment(state, now)
          const nextSessionCount = state.sessionCount + 1
          const nextPhase = getBreakPhase(state.profileId, nextSessionCount)
          const breakDuration = getPhaseDuration(state.profileId, nextPhase)
          const transition: TimerTransition = 'focus_completed'

          set({
            phase: nextPhase,
            remainingSeconds: breakDuration,
            sessionCount: nextSessionCount,
            taskId: null,
            startedAt: now,
            endsAt: now + breakDuration,
            focusElapsedSeconds: state.focusElapsedSeconds + credited,
            lastTransition: transition,
            lastTransitionAt: now,
          })
          return
        }

        const transition: TimerTransition = state.phase === 'short_break_running'
          ? 'short_break_completed'
          : 'long_break_completed'

        set({
          phase: 'idle',
          remainingSeconds: profile.focusSeconds,
          taskId: null,
          startedAt: null,
          endsAt: null,
          focusElapsedSeconds: 0,
          lastTransition: transition,
          lastTransitionAt: now,
        })
      },
    }),
    {
      name: 'focusdeck-timer-storage',
      version: 4,
      partialize: (state) => ({
        profileId: state.profileId,
        phase: state.phase,
        remainingSeconds: state.phase.endsWith('_running')
          ? remainingFromEndsAt(state.endsAt)
          : state.remainingSeconds,
        sessionCount: state.sessionCount,
        taskId: state.taskId,
        startedAt: state.startedAt,
        endsAt: state.endsAt,
        focusElapsedSeconds: state.focusElapsedSeconds,
        lastTransition: null,
        lastTransitionAt: null,
      }) as TimerStore,
      migrate: (persistedState) => {
        const state = persistedState as PersistedTimerState
        if (!state) return persistedState as TimerStore
        const next = {
          ...state,
          lastTransition: null,
          lastTransitionAt: null,
        }
        if (state.phase.endsWith('_running') && state.endsAt != null) {
          return {
            ...next,
            remainingSeconds: remainingFromEndsAt(state.endsAt),
          } as TimerStore
        }
        return next as TimerStore
      },
      onRehydrateStorage: () => (state) => {
        if (!state?.phase.endsWith('_running')) return
        queueMicrotask(() => useTimerStore.getState().tick())
      },
    }
  )
)

export function useTimerRemaining() {
  const phase = useTimerStore((s) => s.phase)
  const remainingSeconds = useTimerStore((s) => s.remainingSeconds)
  const endsAt = useTimerStore((s) => s.endsAt)
  const running = phase.endsWith('_running')
  const now = useNowSeconds(running)
  if (running && endsAt != null) return Math.max(0, endsAt - now)
  return remainingSeconds
}
