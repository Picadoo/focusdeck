export type Priority = 'p1' | 'p2' | 'p3' | 'p4'

export interface Project {
  id: string
  name: string
  color: string
}

export interface Tag {
  id: string
  name: string
}

export interface Task {
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

export interface TimerProfile {
  id: string
  name: string
  focusSeconds: number
  shortBreakSeconds: number
  longBreakSeconds: number
  sessionsBeforeLongBreak: number
}

export type TimerPhase = 'idle' | 'focus_running' | 'focus_paused' | 'short_break_running' | 'long_break_running'

export interface TimerState {
  profileId: string
  phase: TimerPhase
  remainingSeconds: number
  sessionCount: number
  taskId: string | null
  startedAt: number | null
  endsAt: number | null
}

export type ScheduleEventType = 'fixed' | 'task_block'

export interface ScheduleEvent {
  id: string
  title: string
  projectId: string
  taskId?: string
  dayIndex: number // 0 = Monday
  startMinutes: number
  durationMinutes: number
  type: ScheduleEventType
}

export interface LayoutState {
  showWeekend: boolean
  immersive: boolean
}

export type ViewMode = 'tasks' | 'schedule' | 'timer'

export type PomodoroTheme = {
  focus: string
  break: string
  longBreak: string
}
