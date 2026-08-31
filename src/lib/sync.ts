import type { SyncCollections } from '../types'
import { t } from '../i18n/messages'
import { fetchServerTime, pullSync, pushSync, type AuthSession } from './api'
import { setClockOffset } from './syncMeta'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'

const SINCE_KEY = 'focusdeck-sync-since'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

let inFlight: Promise<void> | null = null
let debounceTimer: number | null = null
let applyingRemote = false

export function isApplyingRemote() {
  return applyingRemote
}

const listeners = new Set<(status: SyncStatus, error?: string | null) => void>()
let lastStatus: SyncStatus = 'idle'
let lastError: string | null = null

export function getSyncStatus() {
  return { status: lastStatus, error: lastError }
}

export function subscribeSyncStatus(listener: (status: SyncStatus, error?: string | null) => void) {
  listeners.add(listener)
  listener(lastStatus, lastError)
  return () => {
    listeners.delete(listener)
  }
}

function setStatus(status: SyncStatus, error: string | null = null) {
  lastStatus = status
  lastError = error
  for (const listener of listeners) listener(status, error)
}

function readSince() {
  const raw = localStorage.getItem(SINCE_KEY)
  const value = raw ? Number(raw) : 0
  return Number.isFinite(value) ? value : 0
}

function writeSince(value: number) {
  localStorage.setItem(SINCE_KEY, String(value))
}

export function resetSyncCursor() {
  localStorage.removeItem(SINCE_KEY)
}

function snapshotCollections(): SyncCollections {
  const state = useAppStore.getState()
  return {
    tasks: state.tasks,
    projects: state.projects,
    tags: state.tags,
    scheduleEvents: state.scheduleEvents,
    timerProfiles: state.timerProfiles,
  }
}

async function syncClock() {
  const { serverNow } = await fetchServerTime()
  setClockOffset(serverNow - Date.now())
}

let queuedSync = false
let lastSyncOk = false

export async function runSync(session: AuthSession): Promise<boolean> {
  if (inFlight) {
    queuedSync = true
    await inFlight
    const current = useAuthStore.getState().session
    if (queuedSync && current) return runSync(current)
    return lastSyncOk
  }
  inFlight = (async () => {
    setStatus('syncing')
    lastSyncOk = false
    try {
      do {
        queuedSync = false
        const current = useAuthStore.getState().session ?? session
        await syncClock()
        const since = readSince()
        const pulled = await pullSync(current.token, since)
        applyingRemote = true
        try {
          useAppStore.getState().applyRemoteCollections(pulled.changes, true)
        } finally {
          applyingRemote = false
        }
        const local = snapshotCollections()
        const pushed = await pushSync(current.token, since, local)
        applyingRemote = true
        try {
          useAppStore.getState().applyRemoteCollections(pushed.changes, true)
        } finally {
          applyingRemote = false
        }
        writeSince(Math.max(pulled.serverNow, pushed.serverNow))
        lastSyncOk = true
        setStatus(navigator.onLine ? 'idle' : 'offline')
      } while (queuedSync)
    } catch (error) {
      lastSyncOk = false
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      setStatus(offline ? 'offline' : 'error', error instanceof Error ? error.message : t('sync.status.error'))
    } finally {
      inFlight = null
    }
  })()
  await inFlight
  return lastSyncOk
}

export function scheduleSync(session: AuthSession | null, delay = 800) {
  if (!session) return
  if (debounceTimer != null) window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null
    void runSync(session)
  }, delay)
}
