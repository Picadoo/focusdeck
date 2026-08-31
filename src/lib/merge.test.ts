import { describe, expect, it } from 'vitest'
import { mergeRecords, pickWinner } from './merge'
import { stampRecord, tombstone } from './syncMeta'
import type { Task } from '../types'

function task(id: string, updatedAt: number, title = id): Task {
  return stampRecord({
    id,
    title,
    projectId: 'work',
    tagIds: [],
    priority: 'p2',
    status: 'active',
    dueAt: null,
    estimatePomodoros: 1,
    actualFocusSeconds: 0,
    sortKey: 1000,
    updatedAt,
    createdAt: updatedAt,
    deletedAt: null,
  }, updatedAt)
}

describe('LWW merge', () => {
  it('keeps the record with the larger updatedAt', () => {
    const local = task('a', 10, 'local')
    const incoming = task('a', 20, 'remote')
    expect(pickWinner(local, incoming).title).toBe('remote')
    expect(pickWinner(incoming, local).title).toBe('remote')
  })

  it('lets the incoming record win when updatedAt is equal', () => {
    const local = task('a', 10, 'local')
    const incoming = task('a', 10, 'server')
    expect(pickWinner(local, incoming, true).title).toBe('server')
    expect(pickWinner(local, incoming, false).title).toBe('local')
  })

  it('unions by id and preserves tombstones', () => {
    const local = [task('a', 10), task('b', 10)]
    const incoming = [tombstone(task('a', 5), 30), task('c', 40)]
    const merged = mergeRecords(local, incoming)
    const byId = Object.fromEntries(merged.map((item) => [item.id, item]))
    expect(byId.a.deletedAt).toBe(30)
    expect(byId.b.title).toBe('b')
    expect(byId.c.title).toBe('c')
  })
})
