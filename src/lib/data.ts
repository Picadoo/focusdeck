import type { Task, Project, Tag, TimerProfile, TimerState, ScheduleEvent } from '../types'

export const DEFAULT_PROJECTS: Project[] = [
  { id: 'work', name: '工作', color: '#5FD4C7' },
  { id: 'study', name: '学习', color: '#E8B05B' },
  { id: 'life', name: '生活', color: '#69C58F' },
  { id: 'side', name: '副业', color: '#9AA7F8' },
]

export const DEFAULT_TAGS: Tag[] = [
  { id: 'urgent', name: '紧急' },
  { id: 'deep', name: '深度' },
  { id: 'review', name: '复盘' },
  { id: 'meeting', name: '会议' },
]

export const DEFAULT_TIMER_PROFILES: TimerProfile[] = [
  { id: 'classic', name: '经典', focusSeconds: 25 * 60, shortBreakSeconds: 5 * 60, longBreakSeconds: 15 * 60, sessionsBeforeLongBreak: 4 },
  { id: 'deep', name: '深度', focusSeconds: 50 * 60, shortBreakSeconds: 10 * 60, longBreakSeconds: 20 * 60, sessionsBeforeLongBreak: 3 },
  { id: 'long', name: '长专注', focusSeconds: 90 * 60, shortBreakSeconds: 20 * 60, longBreakSeconds: 30 * 60, sessionsBeforeLongBreak: 2 },
]

export const DEFAULT_TASKS: Task[] = [
  {
    id: 't1',
    title: '完成 FocusDeck 视觉系统',
    projectId: 'work',
    tagIds: ['deep'],
    priority: 'p1',
    status: 'active',
    dueAt: null,
    estimatePomodoros: 2,
    actualFocusSeconds: 0,
    sortKey: 1000,
  },
  {
    id: 't2',
    title: '实现番茄钟引擎',
    projectId: 'work',
    tagIds: ['deep'],
    priority: 'p1',
    status: 'active',
    dueAt: null,
    estimatePomodoros: 3,
    actualFocusSeconds: 0,
    sortKey: 2000,
  },
  {
    id: 't3',
    title: '购买牛奶和鸡蛋',
    projectId: 'life',
    tagIds: [],
    priority: 'p3',
    status: 'active',
    dueAt: null,
    estimatePomodoros: 1,
    actualFocusSeconds: 0,
    sortKey: 3000,
  },
  {
    id: 't4',
    title: '阅读技术文档 30 分钟',
    projectId: 'study',
    tagIds: ['review'],
    priority: 'p2',
    status: 'active',
    dueAt: null,
    estimatePomodoros: 1,
    actualFocusSeconds: 0,
    sortKey: 4000,
  },
]

export const DEFAULT_TIMER_STATE: TimerState = {
  profileId: 'classic',
  phase: 'idle',
  remainingSeconds: 25 * 60,
  sessionCount: 0,
  taskId: null,
  startedAt: null,
  endsAt: null,
}

export const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export const DEFAULT_SCHEDULE_EVENTS: ScheduleEvent[] = [
  {
    id: 'e1',
    title: '早会',
    projectId: 'work',
    dayIndex: 0,
    startMinutes: 9 * 60,
    durationMinutes: 30,
    type: 'fixed',
  },
  {
    id: 'e2',
    title: '算法课',
    projectId: 'study',
    dayIndex: 2,
    startMinutes: 14 * 60,
    durationMinutes: 90,
    type: 'fixed',
  },
  {
    id: 'e3',
    title: '健身',
    projectId: 'life',
    dayIndex: 4,
    startMinutes: 18 * 60,
    durationMinutes: 60,
    type: 'fixed',
  },
]
