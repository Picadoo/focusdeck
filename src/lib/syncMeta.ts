import type { Project, ScheduleEvent, SyncMeta, Tag, Task, TimerProfile } from '../types'

let clockOffset = 0

export function setClockOffset(offsetMs: number) {
  clockOffset = offsetMs
}

export function getClockOffset() {
  return clockOffset
}

export function nowMs() {
  return Date.now() + clockOffset
}

export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function withSyncMeta<T extends object>(item: T, at = nowMs()): T & SyncMeta {
  return { ...item, createdAt: at, updatedAt: at, deletedAt: null }
}

export function touch<T extends SyncMeta>(item: T, at = nowMs()): T {
  return { ...item, updatedAt: at }
}

export function isAlive<T extends { deletedAt?: number | null; status?: string }>(item: T): boolean {
  if (item.deletedAt != null) return false
  if ('status' in item && item.status === 'deleted') return false
  return true
}

export function stampRecord<T extends { id: string; status?: string }>(item: T, at: number): T & SyncMeta {
  const current = item as T & Partial<SyncMeta>
  const deletedAt = current.deletedAt
    ?? (current.status === 'deleted' ? (current.updatedAt ?? at) : null)
  return {
    ...item,
    createdAt: current.createdAt ?? at,
    updatedAt: current.updatedAt ?? at,
    deletedAt,
  }
}

export function stampCollection<T extends { id: string; status?: string }>(items: T[] | undefined, at: number): Array<T & SyncMeta> {
  return (items ?? []).map((item) => stampRecord(item, at))
}

export function tombstone<T extends SyncMeta>(item: T, at = nowMs()): T {
  const next = { ...item, updatedAt: at, deletedAt: at }
  if ('status' in next && typeof (next as { status?: string }).status === 'string') {
    ;(next as { status: string }).status = 'deleted'
  }
  return next
}

export type StampedTask = Task
export type StampedProject = Project
export type StampedTag = Tag
export type StampedEvent = ScheduleEvent
export type StampedProfile = TimerProfile
