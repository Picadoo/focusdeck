import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Task, Project, Tag, ScheduleEvent, ScheduleRepeat, TimerProfile, SyncCollections } from '../types'
import { defaultProjects, defaultTags, defaultTasks, defaultScheduleEvents, defaultTimerProfiles } from '../lib/data'
import { compareTasksByDue, dateKeyToDate, getDayIndexFromDate, toDateKey } from '../lib/utils'
import { generateId, nowMs, tombstone, touch } from '../lib/syncMeta'
import { mergeCollections } from '../lib/merge'
import { migrateAppPersist } from '../lib/persistMigrate'

interface AppStore {
  tasks: Task[]
  projects: Project[]
  tags: Tag[]
  scheduleEvents: ScheduleEvent[]
  timerProfiles: TimerProfile[]

  addTask: (task: Omit<Task, 'id' | 'sortKey' | 'actualFocusSeconds' | 'status' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => string
  updateTask: (id: string, patch: Partial<Task>) => void
  completeTask: (id: string) => void
  uncompleteTask: (id: string) => void
  deleteTask: (id: string) => void
  reorderTasks: (activeId: string, overId: string) => void

  addScheduleEvent: (event: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => string
  addScheduleBlock: (input: {
    title: string
    projectId: string
    date: string
    startMinutes: number
    durationMinutes: number
    repeat?: ScheduleRepeat
  }) => string
  updateScheduleEvent: (id: string, patch: Partial<ScheduleEvent>) => void
  deleteScheduleEvent: (id: string) => void
  deleteScheduleEventsByTask: (taskId: string) => void

  updateTimerProfile: (id: string, patch: Partial<Omit<TimerProfile, 'id' | 'name'>>) => void
  addFocusSeconds: (taskId: string, seconds: number) => void
  applyRemoteCollections: (incoming: Partial<SyncCollections>, incomingWinsOnEqual?: boolean) => void
}

function stampNew<T extends object>(item: T, at = nowMs()) {
  return { ...item, createdAt: at, updatedAt: at, deletedAt: null }
}

export const useAppStore = create(
  persist<AppStore>(
    (set, get) => ({
      tasks: defaultTasks(),
      projects: defaultProjects(),
      tags: defaultTags(),
      scheduleEvents: defaultScheduleEvents(),
      timerProfiles: defaultTimerProfiles(),

      addTask: (task) => {
        const tasks = get().tasks
        const maxSort = tasks.length > 0 ? Math.max(...tasks.map((t) => t.sortKey)) : 0
        const id = generateId()
        const newTask: Task = stampNew({
          ...task,
          id,
          status: 'active' as const,
          actualFocusSeconds: 0,
          sortKey: maxSort + 1000,
        })
        set({ tasks: [...tasks, newTask] })
        return id
      },

      updateTask: (id, patch) => {
        const at = nowMs()
        const nextTasks = get().tasks.map((t) => (t.id === id ? touch({ ...t, ...patch }, at) : t))
        const updatedTask = nextTasks.find((t) => t.id === id)

        let nextEvents = get().scheduleEvents
        if (updatedTask && (patch.title != null || patch.projectId != null || patch.estimatePomodoros != null)) {
          nextEvents = nextEvents.map((e) => {
            if (e.taskId !== id || e.deletedAt != null) return e
            return touch({
              ...e,
              ...(patch.title != null ? { title: patch.title } : {}),
              ...(patch.projectId != null ? { projectId: patch.projectId } : {}),
              ...(patch.estimatePomodoros != null && updatedTask.estimatePomodoros > 0
                ? { durationMinutes: updatedTask.estimatePomodoros * 25 }
                : {}),
            }, at)
          })
        }

        set({ tasks: nextTasks, scheduleEvents: nextEvents })
      },

      completeTask: (id) => {
        const at = nowMs()
        set({
          tasks: get().tasks.map((t) => (t.id === id ? touch({ ...t, status: 'completed' as const }, at) : t)),
        })
      },

      uncompleteTask: (id) => {
        const at = nowMs()
        set({
          tasks: get().tasks.map((t) => (t.id === id ? touch({ ...t, status: 'active' as const }, at) : t)),
        })
      },

      deleteTask: (id) => {
        const at = nowMs()
        set({
          tasks: get().tasks.map((t) => (t.id === id ? tombstone(t, at) : t)),
          scheduleEvents: get().scheduleEvents.map((e) => (e.taskId === id ? tombstone(e, at) : e)),
        })
      },

      reorderTasks: (activeId, overId) => {
        const allTasks = get().tasks
        const visible = [...allTasks.filter((t) => t.status !== 'deleted' && t.deletedAt == null)].sort(compareTasksByDue)
        const activeIndex = visible.findIndex((t) => t.id === activeId)
        const overIndex = visible.findIndex((t) => t.id === overId)
        if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return

        const nextVisible = [...visible]
        const [moved] = nextVisible.splice(activeIndex, 1)
        nextVisible.splice(overIndex, 0, moved)

        const sortById = new Map(nextVisible.map((t, i) => [t.id, (i + 1) * 1000]))
        const at = nowMs()
        set({
          tasks: allTasks.map((t) => (sortById.has(t.id) ? touch({ ...t, sortKey: sortById.get(t.id)! }, at) : t)),
        })
      },

      addScheduleEvent: (event) => {
        const id = generateId()
        const date = event.date || toDateKey()
        const parsed = dateKeyToDate(date) ?? new Date()
        const next: ScheduleEvent = stampNew({
          ...event,
          id,
          date,
          dayIndex: event.dayIndex ?? getDayIndexFromDate(parsed),
          repeat: event.repeat ?? 'none',
        })
        set({
          scheduleEvents: [...get().scheduleEvents, next],
        })
        return id
      },

      addScheduleBlock: ({ title, projectId, date, startMinutes, durationMinutes, repeat = 'none' }) => {
        const parsed = dateKeyToDate(date) ?? new Date()
        const dateKey = toDateKey(parsed)
        const minutes = Math.max(15, durationMinutes)
        const due = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0)
        due.setMinutes(startMinutes)
        const taskId = get().addTask({
          title,
          projectId,
          tagIds: [],
          priority: 'p2',
          dueAt: repeat === 'weekly' ? null : due.getTime(),
          estimatePomodoros: Math.max(1, Math.round(minutes / 25) || 1),
        })
        return get().addScheduleEvent({
          title,
          projectId,
          taskId,
          date: dateKey,
          dayIndex: getDayIndexFromDate(parsed),
          startMinutes,
          durationMinutes: minutes,
          type: 'task_block',
          repeat,
        })
      },

      updateScheduleEvent: (id, patch) => {
        const at = nowMs()
        set({
          scheduleEvents: get().scheduleEvents.map((e) => (e.id === id ? touch({ ...e, ...patch }, at) : e)),
        })
      },

      deleteScheduleEvent: (id) => {
        const at = nowMs()
        set({
          scheduleEvents: get().scheduleEvents.map((e) => (e.id === id ? tombstone(e, at) : e)),
        })
      },

      deleteScheduleEventsByTask: (taskId) => {
        const at = nowMs()
        set({
          scheduleEvents: get().scheduleEvents.map((e) => (e.taskId === taskId ? tombstone(e, at) : e)),
        })
      },

      updateTimerProfile: (id, patch) => {
        const at = nowMs()
        set({
          timerProfiles: get().timerProfiles.map((profile) => (
            profile.id === id ? touch({ ...profile, ...patch }, at) : profile
          )),
        })
      },

      addFocusSeconds: (taskId, seconds) => {
        const at = nowMs()
        set({
          tasks: get().tasks.map((t) => (t.id === taskId ? touch({ ...t, actualFocusSeconds: t.actualFocusSeconds + seconds }, at) : t)),
        })
      },

      applyRemoteCollections: (incoming, incomingWinsOnEqual = true) => {
        const merged = mergeCollections({
          tasks: get().tasks,
          projects: get().projects,
          tags: get().tags,
          scheduleEvents: get().scheduleEvents,
          timerProfiles: get().timerProfiles,
        }, incoming, incomingWinsOnEqual)
        set(merged)
      },
    }),
    {
      name: 'focusdeck-app-storage',
      version: 6,
      migrate: (persistedState, version) => {
        const migrated = migrateAppPersist(persistedState, version)
        return {
          ...(persistedState as AppStore),
          ...migrated,
        }
      },
    }
  )
)
