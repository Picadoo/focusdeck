import type { Task, Project, Tag, TimerProfile, TimerState, ScheduleEvent, SyncMeta } from '../types'
import { t } from '../i18n/messages'
import { dueTimestampForOffset, getWeekStart, toDateKey } from './utils'

/** Stable seed timestamps so first-run defaults stay deterministic. */
export const SEED_AT = 1_704_067_200_000

export function withSyncMeta<T extends object>(item: T, at = SEED_AT): T & SyncMeta {
  return { ...item, createdAt: at, updatedAt: at, deletedAt: null }
}

function weekDateKey(dayIndex: number) {
  const date = getWeekStart()
  date.setDate(date.getDate() + dayIndex)
  return toDateKey(date)
}

/**
 * 种子数据是**函数不是常量**：首次运行时才按当时的语言生成一份，
 * 之后它就是用户自己的数据，跟着数据走、不再随语言切换而改写。
 */
export function defaultProjects(): Project[] {
  return [
    { id: 'work', name: t('seed.project.work'), color: '#5FD4C7' },
    { id: 'study', name: t('seed.project.study'), color: '#E8B05B' },
    { id: 'life', name: t('seed.project.life'), color: '#69C58F' },
    { id: 'side', name: t('seed.project.side'), color: '#9AA7F8' },
  ].map((item) => withSyncMeta(item))
}

export function defaultTags(): Tag[] {
  return [
    { id: 'urgent', name: t('seed.tag.urgent') },
    { id: 'deep', name: t('seed.tag.deep') },
    { id: 'review', name: t('seed.tag.review') },
    { id: 'meeting', name: t('seed.tag.meeting') },
  ].map((item) => withSyncMeta(item))
}

export function defaultTimerProfiles(): TimerProfile[] {
  return [
    { id: 'classic', name: t('seed.profile.classic'), focusSeconds: 25 * 60, shortBreakSeconds: 5 * 60, longBreakSeconds: 15 * 60, sessionsBeforeLongBreak: 4 },
    { id: 'deep', name: t('seed.profile.deep'), focusSeconds: 50 * 60, shortBreakSeconds: 10 * 60, longBreakSeconds: 20 * 60, sessionsBeforeLongBreak: 3 },
    { id: 'long', name: t('seed.profile.long'), focusSeconds: 90 * 60, shortBreakSeconds: 20 * 60, longBreakSeconds: 30 * 60, sessionsBeforeLongBreak: 2 },
  ].map((item) => withSyncMeta(item))
}

export function defaultTasks(): Task[] {
  return [
    {
      id: 't1',
      title: t('seed.task.t1'),
      projectId: 'work',
      tagIds: ['deep'],
      priority: 'p1',
      status: 'active',
      dueAt: dueTimestampForOffset(0),
      estimatePomodoros: 2,
      actualFocusSeconds: 0,
      sortKey: 1000,
    },
    {
      id: 't2',
      title: t('seed.task.t2'),
      projectId: 'work',
      tagIds: ['deep'],
      priority: 'p1',
      status: 'active',
      dueAt: dueTimestampForOffset(1),
      estimatePomodoros: 3,
      actualFocusSeconds: 0,
      sortKey: 2000,
    },
    {
      id: 't3',
      title: t('seed.task.t3'),
      projectId: 'life',
      tagIds: [],
      priority: 'p3',
      status: 'active',
      dueAt: dueTimestampForOffset(-1),
      estimatePomodoros: 1,
      actualFocusSeconds: 0,
      sortKey: 3000,
    },
    {
      id: 't4',
      title: t('seed.task.t4'),
      projectId: 'study',
      tagIds: ['review'],
      priority: 'p2',
      status: 'active',
      dueAt: dueTimestampForOffset(2),
      estimatePomodoros: 1,
      actualFocusSeconds: 0,
      sortKey: 4000,
    },
    {
      id: 't5',
      title: t('seed.task.t5'),
      projectId: 'work',
      tagIds: ['review'],
      priority: 'p2',
      status: 'active',
      dueAt: dueTimestampForOffset(3),
      estimatePomodoros: 1,
      actualFocusSeconds: 0,
      sortKey: 5000,
    },
    {
      id: 't6',
      title: t('seed.task.t6'),
      projectId: 'work',
      tagIds: ['urgent'],
      priority: 'p1',
      status: 'active',
      dueAt: dueTimestampForOffset(0),
      estimatePomodoros: 1,
      actualFocusSeconds: 0,
      sortKey: 6000,
    },
    {
      id: 't7',
      title: t('seed.task.t7'),
      projectId: 'study',
      tagIds: ['deep'],
      priority: 'p2',
      status: 'active',
      dueAt: dueTimestampForOffset(5),
      estimatePomodoros: 2,
      actualFocusSeconds: 0,
      sortKey: 7000,
    },
    {
      id: 't8',
      title: t('seed.task.t8'),
      projectId: 'life',
      tagIds: [],
      priority: 'p3',
      status: 'active',
      dueAt: dueTimestampForOffset(7),
      estimatePomodoros: 1,
      actualFocusSeconds: 0,
      sortKey: 8000,
    },
    {
      id: 't9',
      title: t('seed.task.t9'),
      projectId: 'side',
      tagIds: ['deep'],
      priority: 'p3',
      status: 'active',
      dueAt: dueTimestampForOffset(4),
      estimatePomodoros: 2,
      actualFocusSeconds: 0,
      sortKey: 9000,
    },
    {
      id: 't10',
      title: t('seed.task.t10'),
      projectId: 'life',
      tagIds: [],
      priority: 'p4',
      status: 'active',
      dueAt: null,
      estimatePomodoros: 1,
      actualFocusSeconds: 0,
      sortKey: 10000,
    },
  ].map((item) => withSyncMeta(item)) as Task[]
}

export const DEFAULT_TIMER_STATE: TimerState = {
  profileId: 'classic',
  phase: 'idle',
  remainingSeconds: 25 * 60,
  sessionCount: 0,
  taskId: null,
  startedAt: null,
  endsAt: null,
  focusElapsedSeconds: 0,
  lastTransition: null,
  lastTransitionAt: null,
}

/** 周一起头，与 `getDayIndexFromDate` 的 0=周一 对齐。 */
export function weekDays(): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => t(`weekday.long.${i}` as 'weekday.long.0'))
}

/**
 * 窄屏用的单字缩写。中文能靠 `slice(-1)` 从「周一」截出「一」，英文不行，
 * 所以两种语言各自在词典里给一份，调用方不再做字符串切割。
 */
export function weekDaysShort(): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => t(`weekday.short.${i}` as 'weekday.short.0'))
}

export function defaultScheduleEvents(): ScheduleEvent[] {
  return [
    {
      id: 'e1',
      title: t('seed.event.e1'),
      projectId: 'work',
      date: weekDateKey(0),
      dayIndex: 0,
      startMinutes: 9 * 60,
      durationMinutes: 30,
      type: 'fixed',
      repeat: 'weekly',
    },
    {
      id: 'e2',
      title: t('seed.event.e2'),
      projectId: 'study',
      date: weekDateKey(2),
      dayIndex: 2,
      startMinutes: 14 * 60,
      durationMinutes: 90,
      type: 'fixed',
      repeat: 'weekly',
    },
    {
      id: 'e3',
      title: t('seed.event.e3'),
      projectId: 'life',
      date: weekDateKey(4),
      dayIndex: 4,
      startMinutes: 18 * 60,
      durationMinutes: 60,
      type: 'fixed',
      repeat: 'weekly',
    },
    {
      id: 'e4',
      title: t('seed.event.e4'),
      projectId: 'life',
      date: weekDateKey(0),
      dayIndex: 0,
      startMinutes: 19 * 60,
      durationMinutes: 60,
      type: 'fixed',
      repeat: 'weekly',
    },
  ].map((item) => withSyncMeta(item)) as ScheduleEvent[]
}
