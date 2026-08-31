import { useCallback, useEffect, useRef, useState } from 'react'
import { registerOverlay } from '../../lib/overlayStack'
import { BellRing, Volume2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { isTimerCompletion, notifyTimerCompletion, playPhaseChime, PREVIEW_TIMER_ALERT, unlockAlertAudio } from '../../lib/alerts'
import { restoreFavicon, setAlertFavicon } from '../../lib/favicon'
import { formatDuration } from '../../lib/utils'
import { useTimerRemaining, useTimerStore } from '../../stores/timerStore'
import { useUIStore } from '../../stores/uiStore'
import { t, useI18n, useLocale, type MessageKey } from '../../i18n'
import type { TimerTransition } from '../../types'
import './timer-alerts.css'

type CompletionTransition = Extract<
  TimerTransition,
  'focus_completed' | 'short_break_completed' | 'long_break_completed'
>

/**
 * 文案键而不是文案本身：系统通知是在 effect 里发的，那时候拿不到 hook，
 * 存键就能让 React 里外都走同一份词典。
 */
const COMPLETION_COPY: Record<CompletionTransition, {
  titleKey: MessageKey
  bodyKey: MessageKey
  actionKey: MessageKey
  kind: 'focus' | 'break'
}> = {
  focus_completed: {
    titleKey: 'timer.notice.focusCompleted.title',
    bodyKey: 'timer.overlay.focusCompleted.body',
    actionKey: 'common.gotIt',
    kind: 'focus',
  },
  short_break_completed: {
    titleKey: 'timer.notice.shortBreakCompleted.title',
    bodyKey: 'timer.overlay.shortBreakCompleted.body',
    actionKey: 'timer.action.startFocus',
    kind: 'break',
  },
  long_break_completed: {
    titleKey: 'timer.notice.longBreakCompleted.title',
    bodyKey: 'timer.overlay.longBreakCompleted.body',
    actionKey: 'timer.action.startFocus',
    kind: 'break',
  },
}

let lastHandledTransitionAt: number | null = null

/** 标签页标题的闪烁周期。慢到不烦人，快到扫一眼能看出它在动。 */
const TITLE_BLINK_MS = 900

/**
 * favicon 要画进 canvas，只能拿具体色值，取不到就退回令牌的当前值。
 * 从 CSS 变量读而不是写死，是为了配色只有 index.css 一个出处。
 */
function phaseColor(kind: 'focus' | 'break') {
  const fallback = kind === 'focus' ? '#ffab00' : '#00a76f'
  if (typeof document === 'undefined') return fallback
  const name = kind === 'focus' ? '--focus' : '--accent'
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function TimerAlerts() {
  const lastTransition = useTimerStore((s) => s.lastTransition)
  const lastTransitionAt = useTimerStore((s) => s.lastTransitionAt)
  const { soundEnabled, overlayEnabled, notifyEnabled } = useUIStore(useShallow((s) => ({
    soundEnabled: s.soundEnabled,
    overlayEnabled: s.overlayEnabled,
    notifyEnabled: s.notifyEnabled,
  })))
  const [previewTransition, setPreviewTransition] = useState<CompletionTransition | null>(null)
  const { t: translate } = useI18n()
  const primaryRef = useRef<HTMLButtonElement>(null)
  const completion = isTimerCompletion(lastTransition) ? lastTransition : null
  const overlayTransition = previewTransition ?? (overlayEnabled ? completion : null)
  // 标签页那层不看 overlayEnabled：关掉弹层的人多半正是不想被弹窗打断、
  // 更依赖标题和 favicon。试听也走这里，否则点「试听提醒」看不到这一层。
  const attentionTransition = previewTransition ?? completion

  const dismissOverlay = useCallback((startNext = false) => {
    const current = overlayTransition
    setPreviewTransition(null)
    useTimerStore.getState().clearTransition()
    if (startNext && current && current !== 'focus_completed') {
      useTimerStore.getState().start()
    }
  }, [overlayTransition])

  useEffect(() => {
    function unlock() {
      unlockAlertAudio()
    }
    window.addEventListener('pointerdown', unlock, { once: true, capture: true })
    window.addEventListener('keydown', unlock, { once: true, capture: true })
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true })
      window.removeEventListener('keydown', unlock, { capture: true })
    }
  }, [])

  useEffect(() => {
    function onPreview(event: Event) {
      const transition = (event as CustomEvent<CompletionTransition>).detail ?? 'focus_completed'
      const copy = COMPLETION_COPY[transition] ?? COMPLETION_COPY.focus_completed
      unlockAlertAudio()
      if (useUIStore.getState().soundEnabled) playPhaseChime(copy.kind)
      setPreviewTransition(transition)
    }
    window.addEventListener(PREVIEW_TIMER_ALERT, onPreview)
    return () => window.removeEventListener(PREVIEW_TIMER_ALERT, onPreview)
  }, [])

  useEffect(() => {
    if (!isTimerCompletion(lastTransition) || lastTransitionAt == null) return
    if (lastHandledTransitionAt === lastTransitionAt) return
    lastHandledTransitionAt = lastTransitionAt

    const copy = COMPLETION_COPY[lastTransition]
    if (soundEnabled) playPhaseChime(copy.kind)
    // 门槛从 document.hidden 放宽到「窗口没焦点」：前者只覆盖「切到别的标签页」，
    // 而番茄钟响的时候人多半在**别的应用**里，那时 hidden 仍是 false，通知根本不发。
    if (notifyEnabled && !document.hasFocus()) notifyTimerCompletion(t(copy.titleKey), t(copy.bodyKey))
  }, [lastTransition, lastTransitionAt, notifyEnabled, soundEnabled])

  useEffect(() => {
    if (!overlayTransition) return
    return registerOverlay(() => {
      dismissOverlay(false)
      return true
    })
  }, [dismissOverlay, overlayTransition])

  useEffect(() => {
    if (!overlayTransition) return
    primaryRef.current?.focus()

    function onKey(event: KeyboardEvent) {
      if (event.code !== 'Escape' && event.code !== 'Enter' && event.code !== 'Space') return
      event.preventDefault()
      event.stopPropagation()
      dismissOverlay(event.code === 'Enter' || event.code === 'Space')
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dismissOverlay, overlayTransition])

  return (
    <>
      <TabAttention transition={attentionTransition} />
      {overlayTransition && (
        <div
          className={`timer-alert-overlay tone-${COMPLETION_COPY[overlayTransition].kind}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="timer-alert-title"
          onClick={() => dismissOverlay(false)}
        >
          <span className="timer-alert-flash" aria-hidden="true" />
          <div className="timer-alert-card" onClick={(event) => event.stopPropagation()}>
            <span className="timer-alert-icon" aria-hidden="true">
              {COMPLETION_COPY[overlayTransition].kind === 'focus' ? <BellRing size={36} /> : <Volume2 size={36} />}
            </span>
            <h2 id="timer-alert-title">{translate(COMPLETION_COPY[overlayTransition].titleKey)}</h2>
            <p>{translate(COMPLETION_COPY[overlayTransition].bodyKey)}</p>
            <div className="timer-alert-actions">
              {overlayTransition !== 'focus_completed' && (
                <button
                  ref={primaryRef}
                  className="timer-alert-primary"
                  autoFocus
                  onClick={() => dismissOverlay(true)}
                >
                  {translate(COMPLETION_COPY[overlayTransition].actionKey)}
                </button>
              )}
              <button
                ref={overlayTransition === 'focus_completed' ? primaryRef : undefined}
                className={overlayTransition === 'focus_completed' ? 'timer-alert-primary' : 'timer-alert-secondary'}
                autoFocus={overlayTransition === 'focus_completed'}
                onClick={() => dismissOverlay(false)}
              >
                {overlayTransition === 'focus_completed'
                  ? translate(COMPLETION_COPY[overlayTransition].actionKey)
                  : translate('common.later')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * 标签页这一层的提醒：标题闪烁 + favicon 换成相位色圆环。
 *
 * 存在的理由是弹层只是个 DOM 元素——人切到浏览器别的标签页就完全看不见了。
 * 标题**只有这一个所有者**：专注结束后休息是立刻开跑的，计时文案每秒重写一次，
 * 拆成两个组件各写各的必然互相冲掉，所以提醒态与计时态在同一个 effect 里分支。
 */
function TabAttention({ transition }: { transition: CompletionTransition | null }) {
  const phase = useTimerStore((s) => s.phase)
  const remainingSeconds = useTimerRemaining()
  const locale = useLocale()
  const [blinkOn, setBlinkOn] = useState(false)

  useEffect(() => {
    if (!transition) {
      setBlinkOn(false)
      return
    }
    setBlinkOn(true)
    const id = window.setInterval(() => setBlinkOn((on) => !on), TITLE_BLINK_MS)
    return () => window.clearInterval(id)
  }, [transition])

  useEffect(() => {
    if (!transition) return
    setAlertFavicon(phaseColor(COMPLETION_COPY[transition].kind))
    return restoreFavicon
  }, [transition])

  useEffect(() => {
    const idle = `FocusDeck · ${t('brand.tag')}`
    if (transition) {
      const done = t(COMPLETION_COPY[transition].titleKey)
      document.title = blinkOn ? `${done} · FocusDeck` : idle
      return
    }
    if (phase === 'idle') {
      document.title = idle
      return
    }
    const label = phase.startsWith('focus')
      ? t('timer.step.focus')
      : phase.startsWith('short_break')
        ? t('timer.step.shortBreak')
        : t('timer.step.longBreak')
    document.title = `${formatDuration(remainingSeconds)} ${label} · FocusDeck`
    // t() 是模块级的，locale 只作重算触发器。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blinkOn, locale, phase, remainingSeconds, transition])

  return null
}
