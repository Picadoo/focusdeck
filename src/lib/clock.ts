import { useSyncExternalStore } from 'react'
import { toDateKey } from './utils'

let nowSeconds = Math.floor(Date.now() / 1000)
let secondTimer = 0
const secondListeners = new Set<() => void>()

let currentMinute = new Date()
let minuteStamp = minuteKey(currentMinute)
let minuteTimer = 0
const minuteListeners = new Set<() => void>()

let currentDayKey = toDateKey()
let dayTimer = 0
const dayListeners = new Set<() => void>()

function minuteKey(date: Date) {
  return date.getFullYear() * 1e8 + (date.getMonth() + 1) * 1e6 + date.getDate() * 1e4 + date.getHours() * 100 + date.getMinutes()
}

function msUntilNextSecond() {
  return 1000 - (Date.now() % 1000)
}

function msUntilNextMinute(date = new Date()) {
  return (60 - date.getSeconds()) * 1000 - date.getMilliseconds()
}

function emitSeconds() {
  nowSeconds = Math.floor(Date.now() / 1000)
  secondListeners.forEach((listener) => listener())
}

function loopSeconds() {
  emitSeconds()
  secondTimer = window.setTimeout(loopSeconds, msUntilNextSecond())
}

function onSecondVisible() {
  window.clearTimeout(secondTimer)
  secondTimer = 0
  if (secondListeners.size === 0) return
  loopSeconds()
}

function startSeconds() {
  if (secondTimer) return
  document.addEventListener('visibilitychange', onSecondVisible)
  loopSeconds()
}

function stopSeconds() {
  window.clearTimeout(secondTimer)
  secondTimer = 0
  document.removeEventListener('visibilitychange', onSecondVisible)
}

function subscribeSeconds(listener: () => void) {
  secondListeners.add(listener)
  if (secondListeners.size === 1) startSeconds()
  return () => {
    secondListeners.delete(listener)
    if (secondListeners.size === 0) stopSeconds()
  }
}

function publishMinute(next: Date) {
  const stamp = minuteKey(next)
  if (stamp === minuteStamp) return
  minuteStamp = stamp
  currentMinute = next
  minuteListeners.forEach((listener) => listener())
}

function loopMinutes() {
  const next = new Date()
  publishMinute(next)
  minuteTimer = window.setTimeout(loopMinutes, msUntilNextMinute(next))
}

function onMinuteVisible() {
  window.clearTimeout(minuteTimer)
  minuteTimer = 0
  if (document.hidden || minuteListeners.size === 0) return
  loopMinutes()
}

function startMinutes() {
  if (minuteTimer) return
  document.addEventListener('visibilitychange', onMinuteVisible)
  if (!document.hidden) loopMinutes()
}

function stopMinutes() {
  window.clearTimeout(minuteTimer)
  minuteTimer = 0
  document.removeEventListener('visibilitychange', onMinuteVisible)
}

function subscribeMinutes(listener: () => void) {
  minuteListeners.add(listener)
  if (minuteListeners.size === 1) startMinutes()
  return () => {
    minuteListeners.delete(listener)
    if (minuteListeners.size === 0) stopMinutes()
  }
}

function msUntilNextDay(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return Math.max(250, next.getTime() - date.getTime())
}

function publishDay() {
  const next = toDateKey()
  if (next === currentDayKey) return
  currentDayKey = next
  dayListeners.forEach((listener) => listener())
}

function loopDays() {
  publishDay()
  dayTimer = window.setTimeout(loopDays, msUntilNextDay())
}

function onDayVisible() {
  window.clearTimeout(dayTimer)
  dayTimer = 0
  if (document.hidden || dayListeners.size === 0) return
  publishDay()
  loopDays()
}

function startDays() {
  if (dayTimer) return
  document.addEventListener('visibilitychange', onDayVisible)
  if (!document.hidden) loopDays()
}

function stopDays() {
  window.clearTimeout(dayTimer)
  dayTimer = 0
  document.removeEventListener('visibilitychange', onDayVisible)
}

function subscribeDays(listener: () => void) {
  dayListeners.add(listener)
  if (dayListeners.size === 1) startDays()
  return () => {
    dayListeners.delete(listener)
    if (dayListeners.size === 0) stopDays()
  }
}

const subscribeIdle = () => () => {}

export function useNowSeconds(enabled: boolean) {
  return useSyncExternalStore(
    enabled ? subscribeSeconds : subscribeIdle,
    () => nowSeconds,
    () => nowSeconds,
  )
}

export function useMinuteClock() {
  return useSyncExternalStore(subscribeMinutes, () => currentMinute, () => currentMinute)
}

export function useCalendarDayKey() {
  return useSyncExternalStore(subscribeDays, () => currentDayKey, () => currentDayKey)
}
