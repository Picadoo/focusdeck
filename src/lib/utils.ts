import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

export function formatClock(date: Date = new Date()) {
  return format(date, 'HH:mm', { locale: zhCN })
}

export function formatDate(date: Date = new Date()) {
  return format(date, 'yyyy年M月d日 EEEE', { locale: zhCN })
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
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
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
