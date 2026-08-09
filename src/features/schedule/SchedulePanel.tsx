import { useMemo, useState, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useUIStore } from '../../stores/uiStore'
import { minutesToTimeLabel, getWeekStart, getTodayIndex, colorWithOpacity } from '../../lib/utils'
import { WEEK_DAYS } from '../../lib/data'
import type { ScheduleEvent, Project } from '../../types'
import './schedule-panel.css'

const HOUR_HEIGHT = 52
const START_HOUR = 0
const END_HOUR = 23

export function SchedulePanel() {
  const [weekOffset, setWeekOffset] = useState(0)
  const { showWeekend } = useUIStore()
  const { scheduleEvents, projects } = useAppStore()

  const weekStart = useMemo(() => {
    const base = getWeekStart()
    base.setDate(base.getDate() + weekOffset * 7)
    return base
  }, [weekOffset])

  const todayIndex = getTodayIndex()
  const daysToShow = showWeekend ? 7 : 5
  const dayIndices = Array.from({ length: daysToShow }, (_, i) => i)

  return (
    <>
      <div className="panel-header schedule-header">
        <div className="panel-title">
          <Calendar size={18} />
          本周日程
        </div>
        <div className="schedule-week-nav">
          <button className="icon-btn" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft size={18} />
          </button>
          <span className="schedule-week-label">
            {weekStart.getMonth() + 1}月{weekStart.getDate()}日 开始
          </span>
          <button className="icon-btn" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="panel-body schedule-body">
        <div className="schedule-grid" style={{ height: (END_HOUR - START_HOUR + 1) * HOUR_HEIGHT }}>
          <div className="schedule-time-column">
            {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((hour) => (
              <div key={hour} className="schedule-time-cell">
                <span className="tabular">{String(hour).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          {dayIndices.map((dayIndex) => {
            const dayEvents = scheduleEvents.filter((e) => e.dayIndex === dayIndex)
            const isToday = dayIndex === todayIndex && weekOffset === 0
            const date = new Date(weekStart)
            date.setDate(date.getDate() + dayIndex)

            return (
              <div key={dayIndex} className={`schedule-day-column ${isToday ? 'today' : ''}`}>
                <div className="schedule-day-header">
                  <div className="schedule-day-name">{WEEK_DAYS[dayIndex]}</div>
                  <div className="schedule-day-date">{date.getDate()}日</div>
                </div>

                <div className="schedule-day-cells">
                  {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((hour) => (
                    <div key={hour} className="schedule-hour-cell" />
                  ))}

                  {dayEvents.map((event) => (
                    <EventBlock key={event.id} event={event} projects={projects} />
                  ))}

                  {isToday && <CurrentTimeLine />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function CurrentTimeLine() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const minutes = now.getHours() * 60 + now.getMinutes()
  if (minutes < START_HOUR * 60 || minutes > END_HOUR * 60) return null

  const top = ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT

  return (
    <div className="current-time-line" style={{ top }}>
      <div className="current-time-dot" />
      <div className="current-time-bar" />
    </div>
  )
}

function EventBlock({ event, projects }: { event: ScheduleEvent; projects: Project[] }) {
  const project = projects.find((p) => p.id === event.projectId)
  const top = ((event.startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT
  const height = (event.durationMinutes / 60) * HOUR_HEIGHT
  const color = project?.color ?? '#8E99AA'

  return (
    <div
      className={`schedule-event ${event.type}`}
      style={{
        top,
        height: Math.max(height - 2, 24),
        backgroundColor: colorWithOpacity(color, event.type === 'task_block' ? 0.12 : 0.18),
        borderLeft: `3px solid ${color}`,
        color,
      }}
    >
      <div className="schedule-event-title">{event.title}</div>
      <div className="schedule-event-time">
        <Clock size={10} />
        {minutesToTimeLabel(event.startMinutes)} - {minutesToTimeLabel(event.startMinutes + event.durationMinutes)}
      </div>
    </div>
  )
}
