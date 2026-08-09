import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Task, Project, Tag, ScheduleEvent, TimerProfile } from '../types'
import { DEFAULT_PROJECTS, DEFAULT_TAGS, DEFAULT_TASKS, DEFAULT_SCHEDULE_EVENTS, DEFAULT_TIMER_PROFILES } from '../lib/data'

interface AppStore {
  tasks: Task[]
  projects: Project[]
  tags: Tag[]
  scheduleEvents: ScheduleEvent[]
  timerProfiles: TimerProfile[]

  addTask: (task: Omit<Task, 'id' | 'sortKey' | 'actualFocusSeconds' | 'status' | 'createdAt' | 'updatedAt'>) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  completeTask: (id: string) => void
  uncompleteTask: (id: string) => void
  deleteTask: (id: string) => void
  reorderTasks: (activeId: string, overId: string) => void

  addScheduleEvent: (event: Omit<ScheduleEvent, 'id'>) => void
  updateScheduleEvent: (id: string, patch: Partial<ScheduleEvent>) => void
  deleteScheduleEvent: (id: string) => void
}

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export const useAppStore = create(
  persist<AppStore>(
    (set, get) => ({
      tasks: DEFAULT_TASKS,
      projects: DEFAULT_PROJECTS,
      tags: DEFAULT_TAGS,
      scheduleEvents: DEFAULT_SCHEDULE_EVENTS,
      timerProfiles: DEFAULT_TIMER_PROFILES,

      addTask: (task) => {
        const tasks = get().tasks
        const maxSort = tasks.length > 0 ? Math.max(...tasks.map((t) => t.sortKey)) : 0
        const newTask: Task = {
          ...task,
          id: generateId(),
          status: 'active',
          actualFocusSeconds: 0,
          sortKey: maxSort + 1000,
        }
        set({ tasks: [...tasks, newTask] })
      },

      updateTask: (id, patch) => {
        set({
          tasks: get().tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })
      },

      completeTask: (id) => {
        set({
          tasks: get().tasks.map((t) => (t.id === id ? { ...t, status: 'completed' as const } : t)),
        })
      },

      uncompleteTask: (id) => {
        set({
          tasks: get().tasks.map((t) => (t.id === id ? { ...t, status: 'active' as const } : t)),
        })
      },

      deleteTask: (id) => {
        set({ tasks: get().tasks.filter((t) => t.id !== id) })
      },

      reorderTasks: (activeId, overId) => {
        const tasks = get().tasks.filter((t) => t.status !== 'deleted')
        const activeIndex = tasks.findIndex((t) => t.id === activeId)
        const overIndex = tasks.findIndex((t) => t.id === overId)
        if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return

        const newTasks = [...tasks]
        const [moved] = newTasks.splice(activeIndex, 1)
        newTasks.splice(overIndex, 0, moved)

        // Recompute fractional sort keys to preserve stable ordering
        const sortKeys = newTasks.map((_, i) => (i + 1) * 1000)
        const updated = newTasks.map((t, i) => ({ ...t, sortKey: sortKeys[i] }))
        set({ tasks: updated })
      },

      addScheduleEvent: (event) => {
        set({ scheduleEvents: [...get().scheduleEvents, { ...event, id: generateId() }] })
      },

      updateScheduleEvent: (id, patch) => {
        set({
          scheduleEvents: get().scheduleEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })
      },

      deleteScheduleEvent: (id) => {
        set({ scheduleEvents: get().scheduleEvents.filter((e) => e.id !== id) })
      },
    }),
    {
      name: 'focusdeck-app-storage',
      version: 1,
    }
  )
)
