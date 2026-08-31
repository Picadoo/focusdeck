import { defaultScheduleEvents, defaultTasks } from './data'
import { stampCollection } from './syncMeta'
import { getDayIndexFromDate, dateKeyToDate, getScheduleDateKey, getWeekStart, toDateKey } from './utils'
import type { Project, ScheduleEvent, Tag, Task, TimerProfile } from '../types'

export interface PersistedAppState {
  tasks: Task[]
  projects: Project[]
  tags: Tag[]
  scheduleEvents: ScheduleEvent[]
  timerProfiles: TimerProfile[]
}

export function migrateAppPersist(persistedState: unknown, version: number, at = Date.now()): PersistedAppState {
  const state = (persistedState ?? {}) as Partial<PersistedAppState>
  let tasks = state.tasks ?? []
  let scheduleEvents = state.scheduleEvents ?? []
  const projects = state.projects ?? []
  const tags = state.tags ?? []
  const timerProfiles = state.timerProfiles ?? []

  if (version < 5 && tasks.length > 0) {
    const dueById = new Map(defaultTasks().map((task) => [task.id, task.dueAt]))
    tasks = tasks.map((task) => (
      task.dueAt == null && dueById.has(task.id)
        ? { ...task, dueAt: dueById.get(task.id) ?? null }
        : task
    ))
  }

  if (scheduleEvents.length > 0) {
    const weekStart = getWeekStart()
    scheduleEvents = scheduleEvents.map((event) => {
      const date = version < 3
        ? getScheduleDateKey(event, weekStart)
        : (event.date || getScheduleDateKey(event, weekStart))
      const parsed = dateKeyToDate(date) ?? new Date()
      return {
        ...event,
        date,
        dayIndex: event.dayIndex ?? getDayIndexFromDate(parsed),
        repeat: event.repeat ?? (['e1', 'e2', 'e3'].includes(event.id) ? 'weekly' as const : 'none'),
      }
    })
    if (version < 5 && !scheduleEvents.some((event) => event.id === 'e4')) {
      const seed = defaultScheduleEvents().find((event) => event.id === 'e4')
      if (seed) {
        scheduleEvents.push({
          ...seed,
          date: toDateKey(weekStart),
        })
      }
    }
  }

  if (version < 6) {
    return {
      tasks: stampCollection(tasks, at),
      projects: stampCollection(projects, at),
      tags: stampCollection(tags, at),
      scheduleEvents: stampCollection(scheduleEvents, at),
      timerProfiles: stampCollection(timerProfiles, at),
    }
  }

  return {
    tasks: stampCollection(tasks, at),
    projects: stampCollection(projects, at),
    tags: stampCollection(tags, at),
    scheduleEvents: stampCollection(scheduleEvents, at),
    timerProfiles: stampCollection(timerProfiles, at),
  }
}
