export type Priority = 'p1' | 'p2' | 'p3' | 'p4'

export interface SyncMeta {
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface Project extends SyncMeta {
  id: string
  name: string
  color: string
}

export interface Tag extends SyncMeta {
  id: string
  name: string
}

export interface Task extends SyncMeta {
  id: string
  title: string
  projectId: string
  tagIds: string[]
  priority: Priority
  status: 'active' | 'completed' | 'deleted'
  dueAt: number | null
  estimatePomodoros: number
  actualFocusSeconds: number
  sortKey: number
}

export interface TimerProfile extends SyncMeta {
  id: string
  name: string
  focusSeconds: number
  shortBreakSeconds: number
  longBreakSeconds: number
  sessionsBeforeLongBreak: number
}

export type TimerPhase =
  | 'idle'
  | 'focus_running'
  | 'focus_paused'
  | 'short_break_running'
  | 'short_break_paused'
  | 'long_break_running'
  | 'long_break_paused'
export type TimerTransition =
  | 'focus_completed'
  | 'short_break_completed'
  | 'long_break_completed'
  | 'focus_skipped'
  | 'break_skipped'

export interface TimerState {
  profileId: string
  phase: TimerPhase
  remainingSeconds: number
  sessionCount: number
  taskId: string | null
  startedAt: number | null
  endsAt: number | null
  focusElapsedSeconds: number
  lastTransition: TimerTransition | null
  lastTransitionAt: number | null
}

export type ScheduleEventType = 'fixed' | 'task_block'
export type ScheduleRepeat = 'none' | 'weekly'

export interface ScheduleEvent extends SyncMeta {
  id: string
  title: string
  projectId: string
  taskId?: string
  date: string
  dayIndex: number // 0 = Monday
  startMinutes: number
  durationMinutes: number
  type: ScheduleEventType
  repeat?: ScheduleRepeat
}

export interface SyncCollections {
  tasks: Task[]
  projects: Project[]
  tags: Tag[]
  scheduleEvents: ScheduleEvent[]
  timerProfiles: TimerProfile[]
}

export interface LayoutState {
  showWeekend: boolean
  viewMode: ViewMode
  dayStartHour: number
  dayEndHour: number
}

export type ViewMode = 'overview' | 'tasks' | 'schedule' | 'timer'

export type PomodoroTheme = {
  focus: string
  break: string
  longBreak: string
}
