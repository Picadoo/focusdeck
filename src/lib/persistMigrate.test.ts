import { describe, expect, it } from 'vitest'
import { migrateAppPersist } from './persistMigrate'

describe('persist v6 migrate', () => {
  it('stamps missing sync fields and does not re-inject seed events', () => {
    const migrated = migrateAppPersist({
      tasks: [{
        id: 't1',
        title: '旧任务',
        projectId: 'work',
        tagIds: [],
        priority: 'p1',
        status: 'active',
        dueAt: null,
        estimatePomodoros: 1,
        actualFocusSeconds: 0,
        sortKey: 1000,
      }],
      projects: [{ id: 'work', name: '工作', color: '#5FD4C7' }],
      tags: [{ id: 'deep', name: '深度' }],
      scheduleEvents: [{
        id: 'e1',
        title: '早会',
        projectId: 'work',
        date: '2024-01-01',
        dayIndex: 0,
        startMinutes: 540,
        durationMinutes: 30,
        type: 'fixed',
        repeat: 'weekly',
      }],
      timerProfiles: [{
        id: 'classic',
        name: '经典',
        focusSeconds: 1500,
        shortBreakSeconds: 300,
        longBreakSeconds: 900,
        sessionsBeforeLongBreak: 4,
      }],
    }, 5, 1_700_000_000_000)

    expect(migrated.tasks).toHaveLength(1)
    expect(migrated.tasks[0]).toMatchObject({
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    })
    expect(migrated.scheduleEvents.some((event) => event.id === 'e4')).toBe(false)
    expect(migrated.scheduleEvents[0].deletedAt).toBeNull()
  })

  it('copies deleted status into deletedAt', () => {
    const migrated = migrateAppPersist({
      tasks: [{
        id: 'gone',
        title: '已删',
        projectId: 'work',
        tagIds: [],
        priority: 'p4',
        status: 'deleted',
        dueAt: null,
        estimatePomodoros: 1,
        actualFocusSeconds: 0,
        sortKey: 1,
      }],
      projects: [],
      tags: [],
      scheduleEvents: [],
      timerProfiles: [],
    }, 5, 42)

    expect(migrated.tasks[0].deletedAt).toBe(42)
  })
})
