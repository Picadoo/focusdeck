import type { TimerTransition } from '../types'

let audioCtx: AudioContext | null = null
let pagehideBound = false

function bindAudioLifecycle() {
  if (pagehideBound || typeof window === 'undefined') return
  pagehideBound = true
  window.addEventListener('pagehide', () => {
    if (audioCtx && audioCtx.state !== 'closed') void audioCtx.suspend()
  })
}

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) {
    audioCtx = new Ctor()
    bindAudioLifecycle()
  }
  return audioCtx
}

export function unlockAlertAudio() {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  peak: number,
) {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.018)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.03)
  oscillator.addEventListener('ended', () => {
    oscillator.disconnect()
    gain.disconnect()
  }, { once: true })
}

export function isTimerCompletion(
  transition: TimerTransition | null,
): transition is Extract<TimerTransition, 'focus_completed' | 'short_break_completed' | 'long_break_completed'> {
  return transition === 'focus_completed'
    || transition === 'short_break_completed'
    || transition === 'long_break_completed'
}

export function playPhaseChime(kind: 'focus' | 'break') {
  const ctx = getAudioContext()
  if (!ctx) return

  const play = () => {
    const now = ctx.currentTime + 0.01
    if (kind === 'focus') {
      playTone(ctx, 523.25, now, 0.22, 0.11)
      playTone(ctx, 659.25, now + 0.14, 0.24, 0.1)
      playTone(ctx, 783.99, now + 0.3, 0.38, 0.09)
      return
    }
    playTone(ctx, 392, now, 0.26, 0.09)
    playTone(ctx, 523.25, now + 0.18, 0.4, 0.08)
  }

  if (ctx.state === 'suspended') {
    void ctx.resume().then(play)
    return
  }
  play()
}

export function notifyTimerCompletion(title: string, body: string) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    const notification = new Notification(title, {
      body,
      // 声音归 soundEnabled 那条通道管；这里再响一次会跟应用内的和弦撞成双响，
      // 而用户把 soundEnabled 关掉本来就是明确表示不要声音。
      silent: true,
      // 不自动消失：这是唯一能盖到其他应用之上的通道，8 秒就关等于人离开工位
      // 三分钟回来什么都看不到，那正是最需要它的场景。
      requireInteraction: true,
      tag: 'focusdeck-timer',
    })
    notification.addEventListener('click', () => {
      window.focus()
      notification.close()
    }, { once: true })
  } catch {
    // Chrome app windows can reject Notification construction.
  }
}

export async function requestTimerNotificationPermission() {
  const { requestReminderPermissions } = await import('./nativeReminders')
  const granted = await requestReminderPermissions()
  return (granted ? 'granted' : 'denied') as NotificationPermission
}

export const PREVIEW_TIMER_ALERT = 'focusdeck:preview-alert'

export function previewTimerAlert(
  transition: Extract<TimerTransition, 'focus_completed' | 'short_break_completed' | 'long_break_completed'> = 'focus_completed',
) {
  window.dispatchEvent(new CustomEvent(PREVIEW_TIMER_ALERT, { detail: transition }))
}
