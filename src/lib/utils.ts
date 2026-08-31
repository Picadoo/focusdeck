import { format } from 'date-fns'
import { currentDateLocale, currentDatePattern, t } from '../i18n/messages'

export function formatClock(date: Date = new Date()) {
  return format(date, 'HH:mm', { locale: currentDateLocale() })
}

export function formatDate(date: Date = new Date()) {
  return format(date, currentDatePattern(), { locale: currentDateLocale() })
}

export function formatWeekday(date: Date = new Date()) {
  return format(date, 'EEEE', { locale: currentDateLocale() })
}

/** 人话时长：不足一小时说分钟，整点不带零头。用于专注统计这类给人看的地方。 */
export function formatFocusDuration(totalSeconds: number) {
  const minutes = Math.round(totalSeconds / 60)
  if (minutes < 60) return t('duration.minutes', { minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0
    ? t('duration.hours', { hours })
    : t('duration.hoursMinutes', { hours, minutes: rest })
}

export function startOfLocalDay(date: Date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addLocalDays(date: Date, amount: number) {
  const next = startOfLocalDay(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function dueTimestampForOffset(daysFromToday: number) {
  const date = addLocalDays(new Date(), daysFromToday)
  date.setHours(23, 59, 59, 0)
  return date.getTime()
}

export function formatDueLabel(dueAt: number | null, now: Date = new Date()) {
  if (dueAt == null) return ''
  const due = new Date(dueAt)
  return format(due, due.getFullYear() === now.getFullYear() ? 'M/d HH:mm' : 'yyyy/M/d HH:mm')
}

export function dueUrgency(dueAt: number | null, now: Date = new Date()) {
  if (dueAt == null) return 'none' as const
  if (dueAt < now.getTime()) return 'overdue' as const
  const today = startOfLocalDay(now)
  const dueDay = startOfLocalDay(new Date(dueAt))
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000)
  if (diffDays === 0) return 'today' as const
  if (diffDays === 1) return 'soon' as const
  return 'later' as const
}

export function compareTasksByDue(a: { status: string; dueAt: number | null; sortKey: number }, b: { status: string; dueAt: number | null; sortKey: number }) {
  if (a.status === 'completed' && b.status !== 'completed') return 1
  if (a.status !== 'completed' && b.status === 'completed') return -1
  if (a.dueAt == null && b.dueAt != null) return 1
  if (a.dueAt != null && b.dueAt == null) return -1
  if (a.dueAt != null && b.dueAt != null && a.dueAt !== b.dueAt) return a.dueAt - b.dueAt
  return a.sortKey - b.sortKey
}

export function clampDayHours(startHour: number, endHour: number) {
  const start = Math.min(23, Math.max(0, Math.round(startHour)))
  const end = Math.min(24, Math.max(start + 1, Math.round(endHour)))
  return { dayStartHour: start, dayEndHour: end }
}

export function parseDueDate(value: string) {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = match[4] == null ? 23 : Number(match[4])
  const minute = match[5] == null ? 59 : Number(match[5])
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
}

export function toDateTimeLocal(timestamp: number | null, now: Date = new Date()) {
  if (timestamp == null) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return format(now, "yyyy-MM-dd'T'HH:mm")
  return format(date, "yyyy-MM-dd'T'HH:mm")
}

export function toDateKey(date: Date = new Date()) {
  return format(date, 'yyyy-MM-dd')
}

export function dateKeyToDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export function getDayIndexFromDate(date: Date) {
  const day = date.getDay()
  return day === 0 ? 6 : day - 1
}

export function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 9 * 60
  return Math.min(23 * 60 + 59, Math.max(0, hours * 60 + minutes))
}

export function minutesToTimeInput(minutes: number) {
  return minutesToTimeLabel(minutes)
}

export function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function minutesToTimeLabel(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function getWeekStart(date: Date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d
}

export function getScheduleDateKey(
  event: { date?: string; dayIndex: number; repeat?: 'none' | 'weekly' },
  weekStart: Date = getWeekStart(),
) {
  if (event.repeat === 'weekly') {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + event.dayIndex)
    return toDateKey(date)
  }
  if (event.date) return event.date
  const date = new Date(weekStart)
  date.setDate(date.getDate() + event.dayIndex)
  return toDateKey(date)
}

export function eventOccursOnDate(
  event: { date?: string; dayIndex: number; repeat?: 'none' | 'weekly'; deletedAt?: number | null },
  dateKey: string,
  weekStart: Date = getWeekStart(),
) {
  if (event.deletedAt != null) return false
  if (event.repeat === 'weekly') {
    const date = dateKeyToDate(dateKey)
    if (!date || getDayIndexFromDate(date) !== event.dayIndex) return false
    if (event.date && dateKey < event.date) return false
    return true
  }
  return getScheduleDateKey(event, weekStart) === dateKey
}

export function getTodayIndex() {
  const day = new Date().getDay()
  return day === 0 ? 6 : day - 1
}

export function colorWithOpacity(hex: string, opacity: number) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}
