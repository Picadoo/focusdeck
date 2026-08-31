import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import { useAppStore } from '../stores/appStore'
import { useTimerStore } from '../stores/timerStore'
import { useUIStore } from '../stores/uiStore'
import { t } from '../i18n/messages'
import { dateKeyToDate, eventOccursOnDate, toDateKey } from './utils'
import type { ScheduleEvent, Task, ViewMode } from '../types'

const DATA_ID_START = 1000
const DATA_ID_LIMIT = 4000
const TIMER_NOTIFICATION_ID = 9001
const HORIZON_DAYS = 14
const RESCHEDULE_DEBOUNCE_MS = 800

let rescheduleTimer: number | null = null
let rescheduleInFlight = false
let rescheduleQueued = false

function isNative() {
  return Capacitor.isNativePlatform()
}

function hashId(input: string, offset: number) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return DATA_ID_START + ((hash >>> 0) % DATA_ID_LIMIT) + offset
}

function nextUniqueId(input: string, offset: number, usedIds: Set<number>) {
  let id = hashId(input, offset)
  let step = 1
  while (usedIds.has(id) || id === TIMER_NOTIFICATION_ID) {
    id = DATA_ID_START + ((id - DATA_ID_START + step) % DATA_ID_LIMIT)
    step += 1
  }
  usedIds.add(id)
  return id
}

function dueAtForNotification(task: Task) {
  return task.dueAt
}

function horizonLimit(now: Date) {
  return now.getTime() + HORIZON_DAYS * 86400000
}

function occurrencesForEvent(event: ScheduleEvent, now: Date) {
  const dates: Date[] = []
  const limit = horizonLimit(now)
  if (event.repeat === 'weekly') {
    for (let day = 0; day < HORIZON_DAYS; day += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day)
      const dateKey = toDateKey(date)
      if (event.date && dateKey < event.date) continue
      if (eventOccursOnDate(event, dateKey)) dates.push(date)
    }
    return dates
  }
  const date = dateKeyToDate(event.date)
  if (!date || date.getTime() > limit) return []
  return [date]
}

async function ensurePermissions() {
  if (!isNative()) return false
  const current = await LocalNotifications.checkPermissions()
  if (current.display === 'granted') return true
  if (current.display === 'denied') {
    if (useUIStore.getState().notifyEnabled) useUIStore.getState().setNotifyEnabled(false)
    return false
  }
  const requested = await LocalNotifications.requestPermissions()
  const granted = requested.display === 'granted'
  if (!granted && useUIStore.getState().notifyEnabled) useUIStore.getState().setNotifyEnabled(false)
  return granted
}

export async function requestReminderPermissions() {
  if (!isNative()) {
    if (typeof Notification === 'undefined') return false
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
    return permission === 'granted'
  }
  return ensurePermissions()
}

export async function requestExactReminderSetting() {
  if (!isNative()) return true
  const current = await LocalNotifications.checkExactNotificationSetting().catch(() => ({ exact_alarm: 'granted' as const }))
  if (current.exact_alarm === 'granted') return true
  const next = await LocalNotifications.changeExactNotificationSetting().catch(() => current)
  return next.exact_alarm !== 'denied'
}

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown'

export interface ReminderDiagnostics {
  native: boolean
  permission: PermissionState
  exactAlarm: PermissionState
  pendingCount: number
}

export async function getReminderDiagnostics(): Promise<ReminderDiagnostics> {
  if (!isNative()) {
    return { native: false, permission: 'unknown', exactAlarm: 'unknown', pendingCount: 0 }
  }
  const [permission, exact, pending] = await Promise.all([
    LocalNotifications.checkPermissions().catch(() => null),
    LocalNotifications.checkExactNotificationSetting().catch(() => null),
    LocalNotifications.getPending().catch(() => null),
  ])
  return {
    native: true,
    permission: (permission?.display as PermissionState) ?? 'unknown',
    exactAlarm: (exact?.exact_alarm as PermissionState) ?? 'unknown',
    pendingCount: pending?.notifications.length ?? 0,
  }
}

const TEST_NOTIFICATION_ID = 9002

/**
 * 立即发一条测试通知。延后 3 秒而不是立刻发，是为了让用户来得及退到桌面——
 * 应用在前台时很多 ROM 不显示横幅，会被误判成「通知坏了」。
 */
export async function sendTestReminder() {
  if (!isNative()) {
    if (typeof Notification === 'undefined') return false
    const granted = Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted'
    if (!granted) return false
    new Notification(t('notify.push.testTitle'), { body: t('notify.push.testBody') })
    return true
  }
  const allowed = await ensurePermissions()
  if (!allowed) return false
  try {
    await LocalNotifications.cancel({ notifications: [{ id: TEST_NOTIFICATION_ID }] })
    await LocalNotifications.schedule({
      notifications: [{
        id: TEST_NOTIFICATION_ID,
        title: t('notify.push.testTitle'),
        body: t('notify.push.testBody'),
        schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
        channelId: 'timer',
      }],
    })
    return true
  } catch {
    return false
  }
}

async function cancelDataNotifications() {
  if (!isNative()) return
  try {
    const pending = await LocalNotifications.getPending()
    const ids = pending.notifications
      .map((item) => item.id)
      .filter((id) => id !== TIMER_NOTIFICATION_ID)
    if (ids.length > 0) {
      await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) })
    }
  } catch {
    // Ignore cancel failures so a later schedule can still replace them.
  }
}

export function scheduleDataReminderRefresh() {
  if (!isNative()) return
  if (rescheduleTimer != null) window.clearTimeout(rescheduleTimer)
  rescheduleTimer = window.setTimeout(() => {
    rescheduleTimer = null
    void rescheduleDataReminders()
  }, RESCHEDULE_DEBOUNCE_MS)
}

export async function rescheduleDataReminders() {
  if (!isNative()) return
  if (rescheduleInFlight) {
    rescheduleQueued = true
    return
  }
  rescheduleInFlight = true
  try {
    if (!useUIStore.getState().notifyEnabled) {
      await cancelDataNotifications()
      await LocalNotifications.cancel({ notifications: [{ id: TIMER_NOTIFICATION_ID }] })
      return
    }
    const allowed = await ensurePermissions()
    if (!allowed) return

    await cancelDataNotifications()
    const now = Date.now()
    const today = new Date()
    const limit = horizonLimit(today)
    const notifications: LocalNotificationSchema[] = []
    const usedIds = new Set<number>([TIMER_NOTIFICATION_ID])
    const { tasks, scheduleEvents } = useAppStore.getState()

    for (const task of tasks) {
      if (task.status !== 'active' || task.deletedAt != null) continue
      const at = dueAtForNotification(task)
      if (at == null || at <= now || at > limit) continue
      const id = nextUniqueId(`task:${task.id}`, 0, usedIds)
      notifications.push({
        id,
        title: t('notify.push.taskDue'),
        body: task.title,
        schedule: { at: new Date(at), allowWhileIdle: true },
        extra: { view: 'tasks' satisfies ViewMode },
        channelId: 'tasks',
      })
    }

    for (const event of scheduleEvents) {
      if (event.deletedAt != null) continue
      for (const date of occurrencesForEvent(event, today)) {
        const at = new Date(date)
        at.setHours(0, 0, 0, 0)
        at.setMinutes(event.startMinutes)
        if (at.getTime() <= now || at.getTime() > limit) continue
        const id = nextUniqueId(`event:${event.id}:${toDateKey(date)}`, 1, usedIds)
        notifications.push({
          id,
          title: t('notify.push.eventStart'),
          body: event.title,
          schedule: { at, allowWhileIdle: true },
          extra: { view: 'schedule' satisfies ViewMode },
          channelId: 'schedule',
        })
      }
    }

    if (notifications.length === 0) return
    notifications.sort((a, b) => (a.schedule?.at?.getTime() ?? 0) - (b.schedule?.at?.getTime() ?? 0))
    await LocalNotifications.schedule({ notifications: notifications.slice(0, 64) })
  } catch {
    // Native notification APIs can fail on missing permission or OEM limits.
  } finally {
    rescheduleInFlight = false
    if (rescheduleQueued) {
      rescheduleQueued = false
      scheduleDataReminderRefresh()
    }
  }
}

export async function scheduleTimerReminder(endsAtSeconds: number | null) {
  if (!isNative()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: TIMER_NOTIFICATION_ID }] })
    if (endsAtSeconds == null || !useUIStore.getState().notifyEnabled) return
    const allowed = await ensurePermissions()
    if (!allowed) return
    const at = new Date(endsAtSeconds * 1000)
    if (at.getTime() <= Date.now()) return
    await LocalNotifications.schedule({
      notifications: [{
        id: TIMER_NOTIFICATION_ID,
        title: t('notify.push.timerDone'),
        body: t('notify.push.timerDoneBody'),
        schedule: { at, allowWhileIdle: true },
        extra: { view: 'timer' satisfies ViewMode },
        channelId: 'timer',
      }],
    })
  } catch {
    // Native notification APIs can fail on missing permission or OEM limits.
  }
}

export function bindNativeReminderListeners() {
  if (!isNative()) return () => undefined

  const channelsReady = Promise.all([
    LocalNotifications.createChannel({
      id: 'tasks',
      name: t('notify.channel.tasks'),
      importance: 4,
    }),
    LocalNotifications.createChannel({
      id: 'schedule',
      name: t('notify.channel.schedule'),
      importance: 4,
    }),
    LocalNotifications.createChannel({
      id: 'timer',
      name: t('notify.channel.timer'),
      importance: 5,
    }),
  ]).catch(() => undefined)

  const handle = LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const view = event.notification.extra?.view as ViewMode | undefined
    if (view) useUIStore.getState().setViewMode(view)
  })

  const unsubTimer = useTimerStore.subscribe((state, prev) => {
    if (state.endsAt === prev.endsAt && state.phase === prev.phase) return
    void scheduleTimerReminder(state.phase.endsWith('_running') ? state.endsAt : null)
  })

  const unsubData = useAppStore.subscribe(() => {
    scheduleDataReminderRefresh()
  })

  const unsubNotify = useUIStore.subscribe((state, prev) => {
    if (state.notifyEnabled === prev.notifyEnabled) return
    if (state.notifyEnabled) {
      const timer = useTimerStore.getState()
      void scheduleTimerReminder(timer.phase.endsWith('_running') ? timer.endsAt : null)
      scheduleDataReminderRefresh()
      return
    }
    void rescheduleDataReminders()
  })

  void channelsReady.then(() => requestReminderPermissions()).then((allowed) => {
    if (!allowed) return
    void scheduleTimerReminder(useTimerStore.getState().phase.endsWith('_running') ? useTimerStore.getState().endsAt : null)
    void rescheduleDataReminders()
  })

  return () => {
    if (rescheduleTimer != null) window.clearTimeout(rescheduleTimer)
    void handle.then((listener) => listener.remove())
    unsubTimer()
    unsubData()
    unsubNotify()
  }
}
