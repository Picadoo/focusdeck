import { Clock, Repeat } from 'lucide-react'
import { useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useTimerStore } from '../../stores/timerStore'
import { useUIStore } from '../../stores/uiStore'
import { useCalendarDayKey } from '../../lib/clock'
import { dateKeyToDate, getScheduleDateKey, getWeekStart, minutesToTimeLabel } from '../../lib/utils'
import { weekDays } from '../../lib/data'
import { useI18n, type MessageKey } from '../../i18n'
import type { ScheduleEvent } from '../../types'
import './schedule-summary.css'

type AgendaGroupId = 'earlier' | 'today' | 'tomorrow' | 'later'

const GROUP_LABEL_KEYS: Record<AgendaGroupId, MessageKey> = {
  earlier: 'schedule.summary.group.earlier',
  today: 'common.today',
  tomorrow: 'schedule.offset.tomorrow',
  later: 'schedule.summary.group.later',
}

function groupIdForDistance(distance: number): AgendaGroupId {
  if (distance < 0) return 'earlier'
  if (distance === 0) return 'today'
  if (distance === 1) return 'tomorrow'
  return 'later'
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function ScheduleSummary() {
  const scheduleEvents = useAppStore((s) => s.scheduleEvents)
  const setViewMode = useUIStore((s) => s.setViewMode)
  const startTimer = useTimerStore((s) => s.start)
  const { t } = useI18n()
  const todayKey = useCalendarDayKey()
  const today = useMemo(() => dateKeyToDate(todayKey) ?? new Date(), [todayKey])

  const groupedEvents = useMemo(() => {
    const todayStart = startOfDay(today)
    const weekStart = startOfDay(getWeekStart(today))
    const weekEnd = weekStart + 7 * 86400000
    const sorted = [...scheduleEvents]
      .filter((event) => event.deletedAt == null)
      .map((event) => {
        const dateKey = getScheduleDateKey(event)
        const date = dateKeyToDate(dateKey)
        const dayStart = date ? startOfDay(date) : NaN
        const distance = Number.isNaN(dayStart) ? 99 : Math.round((dayStart - todayStart) / 86400000)
        return { event, dateKey, dayStart, distance }
      })
      .filter((item) => item.dayStart >= weekStart && item.dayStart < weekEnd)
      .sort((a, b) => a.distance - b.distance || a.event.startMinutes - b.event.startMinutes)

    const groups: Array<{ id: AgendaGroupId; events: ScheduleEvent[] }> = [
      { id: 'earlier', events: [] },
      { id: 'today', events: [] },
      { id: 'tomorrow', events: [] },
      { id: 'later', events: [] },
    ]

    for (const item of sorted) {
      const group = groups.find((entry) => entry.id === groupIdForDistance(item.distance))
      group?.events.push(item.event)
    }

    return groups.filter((group) => group.events.length > 0)
  }, [scheduleEvents, today])

  function handleStartTimer(taskId: string) {
    startTimer(taskId)
    setViewMode('timer')
  }

  return (
    <section className="schedule-summary">
      <div className="card-header schedule-summary-header">
        <div className="card-header-copy">
          <div className="card-title">{t('schedule.summary.title')}</div>
          <div className="card-subheader">{t('schedule.summary.subtitle')}</div>
        </div>
        <button className="summary-link" onClick={() => setViewMode('schedule')}>
          {t('schedule.summary.goAdd')}
        </button>
      </div>

      <div className="schedule-summary-body">
        {groupedEvents.length > 0 ? (
          <div className="agenda-groups">
            {groupedEvents.map((group) => (
              <section className="agenda-group" key={group.id}>
                <div className="agenda-group-label">{t(GROUP_LABEL_KEYS[group.id])}</div>
                <div className="agenda-list">
                  {group.events.map((event) => {
                    const date = dateKeyToDate(getScheduleDateKey(event)) ?? today
                    return (
                      <div className="agenda-item" key={event.id}>
                        <div className="agenda-time">
                          <span>{t('schedule.summary.dayLabel', { weekday: weekDays()[event.dayIndex], day: date.getDate() })}</span>
                          <span className="tabular">{minutesToTimeLabel(event.startMinutes)}</span>
                        </div>
                        <div className="agenda-event-copy">
                          <span className="agenda-event-title">
                            {event.title}
                            {event.repeat === 'weekly' && (
                              <span className="agenda-event-repeat">
                                <Repeat size={11} />
                                {t('schedule.summary.weekly')}
                              </span>
                            )}
                          </span>
                          <span className="agenda-event-duration">{t('duration.minutes', { minutes: event.durationMinutes })}</span>
                        </div>
                        {event.taskId ? (
                          <button
                            className="agenda-event-action"
                            title={t('schedule.event.startTimer')}
                            onClick={() => handleStartTimer(event.taskId!)}
                          >
                            <Clock size={16} />
                            {t('schedule.summary.focus')}
                          </button>
                        ) : (
                          <span className={`agenda-event-type ${event.type === 'task_block' ? 'task' : ''}`}>
                            {event.type === 'task_block' ? t('schedule.summary.type.task') : t('schedule.summary.type.fixed')}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="schedule-summary-empty">
            <Clock size={28} />
            <p>{t('schedule.summary.emptyTitle')}</p>
            <span>{t('schedule.summary.emptyHint')}</span>
          </div>
        )}
      </div>
    </section>
  )
}
