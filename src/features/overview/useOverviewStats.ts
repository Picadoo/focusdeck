import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../stores/appStore'
import { useTimerStore } from '../../stores/timerStore'
import { useCalendarDayKey } from '../../lib/clock'
import { eventOccursOnDate } from '../../lib/utils'
import { t, useLocale } from '../../i18n'
import type { ScheduleEvent, Task } from '../../types'

const UPCOMING_DAYS = 7
const LIST_LIMIT = 5

/** 时间线上的一格：日程按 startMinutes 定位，待办按 dueAt 折算成当天分钟数。 */
export interface TimelineItem {
  key: string
  kind: 'event' | 'task'
  minutes: number
  title: string
  detail: string
  overdue: boolean
}

export interface OverviewStats {
  activeCount: number
  completedCount: number
  overdueCount: number
  totalCount: number
  todayEventCount: number
  todayEventMinutes: number
  sessionCount: number
  totalFocusSeconds: number
  timeline: TimelineItem[]
  upcoming: Task[]
  focusTop: Task[]
}

function minutesOfDay(timestamp: number) {
  const date = new Date(timestamp)
  return date.getHours() * 60 + date.getMinutes()
}

function buildTimeline(events: ScheduleEvent[], dueToday: Task[], now: number): TimelineItem[] {
  const items: TimelineItem[] = events.map((event) => ({
    key: `event:${event.id}`,
    kind: 'event',
    minutes: event.startMinutes,
    title: event.title,
    detail: t('overview.timeline.detail.event', { minutes: event.durationMinutes }),
    overdue: false,
  }))
  for (const task of dueToday) {
    if (task.dueAt == null) continue
    items.push({
      key: `task:${task.id}`,
      kind: 'task',
      minutes: minutesOfDay(task.dueAt),
      title: task.title,
      detail: task.estimatePomodoros > 0
        ? t('overview.timeline.detail.taskEstimate', { count: task.estimatePomodoros })
        : t('overview.timeline.detail.taskDue'),
      overdue: task.dueAt < now,
    })
  }
  return items.sort((a, b) => a.minutes - b.minutes)
}

export function useOverviewStats(): OverviewStats {
  const { tasks, scheduleEvents } = useAppStore(useShallow((s) => ({
    tasks: s.tasks,
    scheduleEvents: s.scheduleEvents,
  })))
  const sessionCount = useTimerStore((s) => s.sessionCount)
  const todayKey = useCalendarDayKey()
  // 时间线的 detail 是在 memo 里现拼的，语言变了得重算，否则会停在旧语言上。
  const locale = useLocale()

  return useMemo(() => {
    const now = Date.now()
    const dayEnd = new Date()
    dayEnd.setHours(23, 59, 59, 999)
    const upcomingLimit = now + UPCOMING_DAYS * 86400000

    let activeCount = 0
    let completedCount = 0
    let overdueCount = 0
    let totalCount = 0
    let totalFocusSeconds = 0
    const dueToday: Task[] = []
    const upcoming: Task[] = []
    const focusTop: Task[] = []

    for (const task of tasks) {
      if (task.status === 'deleted' || task.deletedAt != null) continue
      totalCount += 1
      totalFocusSeconds += task.actualFocusSeconds
      if (task.actualFocusSeconds > 0) focusTop.push(task)
      if (task.status === 'completed') {
        completedCount += 1
        continue
      }
      activeCount += 1
      if (task.dueAt == null) continue
      if (task.dueAt < now) {
        overdueCount += 1
      } else if (task.dueAt <= dayEnd.getTime()) {
        dueToday.push(task)
      }
      if (task.dueAt <= upcomingLimit) upcoming.push(task)
    }

    const todayEvents = scheduleEvents.filter((event) => eventOccursOnDate(event, todayKey))
    let todayEventMinutes = 0
    for (const event of todayEvents) todayEventMinutes += event.durationMinutes

    upcoming.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
    focusTop.sort((a, b) => b.actualFocusSeconds - a.actualFocusSeconds)

    return {
      activeCount,
      completedCount,
      overdueCount,
      totalCount,
      todayEventCount: todayEvents.length,
      todayEventMinutes,
      sessionCount,
      totalFocusSeconds,
      timeline: buildTimeline(todayEvents, dueToday, now),
      upcoming: upcoming.slice(0, LIST_LIMIT),
      focusTop: focusTop.slice(0, LIST_LIMIT),
    }
    // buildTimeline 走模块级 t()，语言不是它的入参，linter 看不见这层依赖，
    // 但少了 locale 切语言时时间线文案不会重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, scheduleEvents, sessionCount, tasks, todayKey])
}
