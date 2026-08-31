import type { SyncCollections, SyncMeta } from '../types'

export function pickWinner<T extends SyncMeta>(local: T, incoming: T, incomingWinsOnEqual = true): T {
  if (incoming.updatedAt > local.updatedAt) return incoming
  if (incoming.updatedAt < local.updatedAt) return local
  return incomingWinsOnEqual ? incoming : local
}

export function mergeRecords<T extends SyncMeta & { id: string }>(
  local: T[],
  incoming: T[],
  incomingWinsOnEqual = true,
): T[] {
  const map = new Map(local.map((item) => [item.id, item]))
  for (const rec of incoming) {
    const existing = map.get(rec.id)
    if (!existing) {
      map.set(rec.id, rec)
      continue
    }
    map.set(rec.id, pickWinner(existing, rec, incomingWinsOnEqual))
  }
  return [...map.values()]
}

export function mergeCollections(
  local: SyncCollections,
  incoming: Partial<SyncCollections>,
  incomingWinsOnEqual = true,
): SyncCollections {
  return {
    tasks: mergeRecords(local.tasks, incoming.tasks ?? [], incomingWinsOnEqual),
    projects: mergeRecords(local.projects, incoming.projects ?? [], incomingWinsOnEqual),
    tags: mergeRecords(local.tags, incoming.tags ?? [], incomingWinsOnEqual),
    scheduleEvents: mergeRecords(local.scheduleEvents, incoming.scheduleEvents ?? [], incomingWinsOnEqual),
    timerProfiles: mergeRecords(local.timerProfiles, incoming.timerProfiles ?? [], incomingWinsOnEqual),
  }
}

export function changedSince<T extends SyncMeta>(items: T[], since: number): T[] {
  return items.filter((item) => item.updatedAt > since)
}
