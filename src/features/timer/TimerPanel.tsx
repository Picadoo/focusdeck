import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, CheckCircle2, Circle, Pause, Play, RotateCcw, Settings2, SkipForward } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { isTimerCompletion, previewTimerAlert, requestTimerNotificationPermission, unlockAlertAudio } from '../../lib/alerts'
import { useTimerStore, useTimerRemaining } from '../../stores/timerStore'
import { useAppStore } from '../../stores/appStore'
import { useUIStore } from '../../stores/uiStore'
import { formatDuration } from '../../lib/utils'
import { defaultTimerProfiles } from '../../lib/data'
import { useI18n, type MessageKey } from '../../i18n'
import type { Project, TimerProfile } from '../../types'
import './timer-panel.css'

interface TimerPanelProps {
  fullScreen?: boolean
  onBack?: () => void
}

type DurationField = 'focusSeconds' | 'shortBreakSeconds' | 'longBreakSeconds'

const TRANSITION_NOTICE: Partial<Record<
  NonNullable<ReturnType<typeof useTimerStore.getState>['lastTransition']>,
  string
>> = {
  focus_completed: 'timer.notice.focusCompleted',
  short_break_completed: 'timer.notice.shortBreakCompleted',
  long_break_completed: 'timer.notice.longBreakCompleted',
  focus_skipped: 'timer.notice.focusSkipped',
  break_skipped: 'timer.notice.breakSkipped',
}

export function TimerPanel({ fullScreen = false, onBack }: TimerPanelProps) {
  const { phase, profileId, taskId, sessionCount, lastTransition } = useTimerStore(useShallow((s) => ({
    phase: s.phase,
    profileId: s.profileId,
    taskId: s.taskId,
    sessionCount: s.sessionCount,
    lastTransition: s.lastTransition,
  })))
  const { tasks, projects, timerProfiles, updateTimerProfile } = useAppStore(useShallow((s) => ({
    tasks: s.tasks,
    projects: s.projects,
    timerProfiles: s.timerProfiles,
    updateTimerProfile: s.updateTimerProfile,
  })))
  const [showSettings, setShowSettings] = useState(false)
  const { soundEnabled, overlayEnabled, notifyEnabled, setSoundEnabled, setOverlayEnabled, setNotifyEnabled } = useUIStore(useShallow((s) => ({
    soundEnabled: s.soundEnabled,
    overlayEnabled: s.overlayEnabled,
    notifyEnabled: s.notifyEnabled,
    setSoundEnabled: s.setSoundEnabled,
    setOverlayEnabled: s.setOverlayEnabled,
    setNotifyEnabled: s.setNotifyEnabled,
  })))

  const { t } = useI18n()

  const profile = timerProfiles.find((p) => p.id === profileId) ?? defaultTimerProfiles()[0]
  const task = taskId ? tasks.find((t) => t.id === taskId) : null
  const activeTasks = useMemo(() => tasks.filter((t) => t.status === 'active'), [tasks])

  const totalDuration = useMemo(() => {
    if (phase.startsWith('short_break')) return profile.shortBreakSeconds
    if (phase.startsWith('long_break')) return profile.longBreakSeconds
    return profile.focusSeconds
  }, [phase, profile])
  const isRunning = phase.endsWith('_running')
  const isPaused = phase.endsWith('_paused')
  const isFocus = phase.startsWith('focus') || phase === 'idle'
  const phaseColor = isFocus ? 'var(--focus)' : 'var(--accent)'
  const phaseLabel = phase === 'idle'
    ? t('timer.phase.idle')
    : phase === 'focus_running'
      ? t('timer.status.focus')
      : phase === 'focus_paused'
        ? t('timer.status.focusPaused')
        : phase === 'short_break_running'
          ? t('timer.status.shortBreak')
          : phase === 'short_break_paused'
            ? t('timer.status.shortBreakPaused')
            : phase === 'long_break_running'
              ? t('timer.status.longBreak')
              : t('timer.status.longBreakPaused')
  const locked = phase !== 'idle'
  // 当前 Chrome 上滚动条是覆盖式的、不占布局也不常驻，列表能滚却看不出来，
  // 只剩底部一条被切一半的行像渲染坏了。溢出时补一层渐隐当可滚提示。
  const pickerRef = useRef<HTMLUListElement>(null)
  const [pickerScrollable, setPickerScrollable] = useState(false)
  useLayoutEffect(() => {
    const el = pickerRef.current
    if (!el) return
    const sync = () => setPickerScrollable(el.scrollHeight - el.clientHeight > 1)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [activeTasks.length])

  const currentStep = phase.startsWith('short_break')
    ? 1
    : phase.startsWith('long_break')
      ? 2
      : 0
  const noticeKey = lastTransition ? TRANSITION_NOTICE[lastTransition] : undefined

  function handleDurationChange(field: DurationField, rawValue: string) {
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return
    const minutes = Math.min(180, Math.max(1, Math.round(value)))
    const patch: Partial<Pick<TimerProfile, DurationField>> = { [field]: minutes * 60 } as Pick<TimerProfile, DurationField>
    updateTimerProfile(profile.id, patch)
    if (phase === 'idle') useTimerStore.getState().refreshIdleDuration()
  }

  function handleSessionsChange(rawValue: string) {
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return
    const sessions = Math.min(8, Math.max(1, Math.round(value)))
    updateTimerProfile(profile.id, { sessionsBeforeLongBreak: sessions })
  }

  return (
    <div className={`timer-page ${fullScreen ? 'timer-page-full' : ''}`}>
      <header className="timer-topbar">
        <div className="card-header-copy">
          <div className="card-title">{t('timer.title')}</div>
          <div className="card-subheader">
            {t('timer.subheader', { name: profile.name, minutes: Math.round(profile.focusSeconds / 60) })}
          </div>
        </div>
        <div className="timer-header-actions">
          <select
            className="timer-profile-select"
            value={profileId}
            onChange={(e) => useTimerStore.getState().setProfile(e.target.value)}
            aria-label={t('a11y.selectProfile')}
          >
            {timerProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            className={`timer-settings-toggle ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings((visible) => !visible)}
          >
            <Settings2 size={18} />
            {showSettings ? t('timer.settings.collapse') : t('timer.settings.open')}
          </button>
          {fullScreen && onBack && (
            <button className="timer-back-button" onClick={onBack}>
              <ArrowLeft size={18} />
              {t('timer.back')}
            </button>
          )}
        </div>
      </header>

      {showSettings && (
        <section key={profile.id} className="card timer-settings-panel" aria-label={t('a11y.timerSettings')}>
          <div className="timer-settings-heading">
            <div>
              <strong>{t('timer.settings.editing', { name: profile.name })}</strong>
              <span>{t('timer.settings.editingHint')}</span>
            </div>
            <span className="timer-settings-hint">{t('timer.settings.runningHint')}</span>
          </div>
          <div className="timer-settings-grid">
            <label className="timer-setting-field">
              <span>{t('timer.settings.focus')}</span>
              <div className="timer-number-input">
                <input type="number" min="1" max="180" defaultValue={Math.round(profile.focusSeconds / 60)} onBlur={(e) => handleDurationChange('focusSeconds', e.currentTarget.value)} />
                <em>{t('unit.minutes')}</em>
              </div>
            </label>
            <label className="timer-setting-field">
              <span>{t('timer.settings.shortBreak')}</span>
              <div className="timer-number-input">
                <input type="number" min="1" max="180" defaultValue={Math.round(profile.shortBreakSeconds / 60)} onBlur={(e) => handleDurationChange('shortBreakSeconds', e.currentTarget.value)} />
                <em>{t('unit.minutes')}</em>
              </div>
            </label>
            <label className="timer-setting-field">
              <span>{t('timer.settings.longBreak')}</span>
              <div className="timer-number-input">
                <input type="number" min="1" max="180" defaultValue={Math.round(profile.longBreakSeconds / 60)} onBlur={(e) => handleDurationChange('longBreakSeconds', e.currentTarget.value)} />
                <em>{t('unit.minutes')}</em>
              </div>
            </label>
            <label className="timer-setting-field">
              <span>{t('timer.settings.interval')}</span>
              <div className="timer-number-input">
                <input type="number" min="1" max="8" defaultValue={profile.sessionsBeforeLongBreak} onBlur={(e) => handleSessionsChange(e.currentTarget.value)} />
                <em>{t('timer.settings.pomodoroUnit')}</em>
              </div>
            </label>
          </div>
          <div className="timer-alert-settings">
            <label className={`timer-alert-toggle ${soundEnabled ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => {
                  setSoundEnabled(e.target.checked)
                  if (e.target.checked) unlockAlertAudio()
                }}
              />
              {t('timer.alert.sound')}
            </label>
            <label className={`timer-alert-toggle ${overlayEnabled ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={overlayEnabled}
                onChange={(e) => setOverlayEnabled(e.target.checked)}
              />
              {t('timer.alert.overlay')}
            </label>
            <label className={`timer-alert-toggle ${notifyEnabled ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={notifyEnabled}
                onChange={async (e) => {
                  const enabled = e.target.checked
                  if (enabled) {
                    const permission = await requestTimerNotificationPermission()
                    setNotifyEnabled(permission === 'granted')
                    if (permission === 'granted') {
                      const { requestExactReminderSetting } = await import('../../lib/nativeReminders')
                      void requestExactReminderSetting()
                    }
                    return
                  }
                  setNotifyEnabled(false)
                }}
              />
              {t('timer.alert.notify')}
            </label>
            <button
              type="button"
              className="timer-alert-preview"
              onClick={() => {
                unlockAlertAudio()
                previewTimerAlert('focus_completed')
              }}
            >
              {t('timer.alert.preview')}
            </button>
          </div>
        </section>
      )}

      {noticeKey && !(overlayEnabled && isTimerCompletion(lastTransition)) && (
        <div className="timer-transition-notice" role="status">
          <div>
            <strong>{t(`${noticeKey}.title` as MessageKey)}</strong>
            <span>{t(`${noticeKey}.body` as MessageKey)}</span>
          </div>
          <button onClick={() => useTimerStore.getState().clearTransition()}>{t('common.gotIt')}</button>
        </div>
      )}

      <section className="card timer-stage">
        <div className="timer-focus-area">
          <TimerFace
            phaseColor={phaseColor}
            phaseLabel={phaseLabel}
            currentStep={currentStep}
            totalDuration={totalDuration}
          />

          <div className="timer-focus-note">
            {task ? t('timer.focusNote.task', { title: task.title }) : t('timer.focusNote.none')}
          </div>

          <div className="timer-controls">
            {!isRunning && !isPaused && (
              <button
                className={`timer-btn primary ${isFocus ? 'tone-warning' : 'tone-primary'}`}
                onClick={() => {
                  unlockAlertAudio()
                  useTimerStore.getState().start()
                }}
              >
                <Play size={22} fill="currentColor" />
                {isFocus ? t('timer.action.startFocus') : t('timer.action.startBreak')}
              </button>
            )}
            {(isRunning || isPaused) && (
              <button
                className={`timer-btn primary ${isFocus ? 'tone-warning' : 'tone-primary'}`}
                onClick={() => {
                  unlockAlertAudio()
                  const timer = useTimerStore.getState()
                  if (isPaused) timer.resume()
                  else timer.pause()
                }}
              >
                {isPaused ? <Play size={22} fill="currentColor" /> : <Pause size={22} fill="currentColor" />}
                {isPaused
                  ? (isFocus ? t('timer.action.resumeFocus') : t('timer.action.resumeBreak'))
                  : (isFocus ? t('timer.action.pauseFocus') : t('timer.action.pauseBreak'))}
              </button>
            )}
            <button className="timer-btn ghost" onClick={() => useTimerStore.getState().skip()} disabled={phase === 'idle'}>
              <SkipForward size={20} />
              {t('timer.action.skip')}
            </button>
            <button className="timer-btn ghost" onClick={() => useTimerStore.getState().reset()}>
              <RotateCcw size={20} />
              {t('timer.action.reset')}
            </button>
          </div>
        </div>
      </section>

      <aside className="timer-side">
        <section className="card timer-context">
          <div className="timer-context-label">
            {t('timer.context.currentTask')}
            {activeTasks.length > 0 && <em>{t('timer.context.optionCount', { count: activeTasks.length })}</em>}
          </div>
          {activeTasks.length === 0 ? (
            <p className="timer-picker-empty">{t('timer.picker.empty')}</p>
          ) : (
            <ul
              ref={pickerRef}
              className={`timer-picker${pickerScrollable ? ' scrollable' : ''}`}
              role="radiogroup"
              aria-label={t('a11y.selectTask')}
            >
              <TaskPickerRow
                selected={taskId === null}
                disabled={locked}
                title={t('timer.picker.noTask')}
                onSelect={() => useTimerStore.getState().setTask(null)}
              />
              {activeTasks.map((item) => (
                <TaskPickerRow
                  key={item.id}
                  selected={taskId === item.id}
                  disabled={locked}
                  title={item.title}
                  project={projects.find((p) => p.id === item.projectId) ?? null}
                  done={Math.floor(item.actualFocusSeconds / Math.max(1, profile.focusSeconds))}
                  estimate={item.estimatePomodoros}
                  onSelect={() => useTimerStore.getState().setTask(item.id)}
                />
              ))}
            </ul>
          )}
          {locked && <p className="timer-picker-empty">{t('timer.picker.locked')}</p>}
        </section>

        <section className="card timer-stats-card">
          <div className="timer-context-label">{t('timer.stats.title')}</div>
          <div className="timer-stats">
            <div className="timer-stat">
              <div className="timer-stat-value">{sessionCount}</div>
              <div className="timer-stat-label">{t('timer.stats.pomodoros')}</div>
            </div>
            <div className="timer-stat">
              <div className="timer-stat-value tabular">{Math.floor((sessionCount * profile.focusSeconds) / 60)}</div>
              <div className="timer-stat-label">{t('timer.stats.minutes')}</div>
            </div>
            <div className="timer-stat">
              <div className="timer-stat-value">{profile.sessionsBeforeLongBreak}</div>
              <div className="timer-stat-label">{t('timer.settings.interval')}</div>
            </div>
          </div>
        </section>
      </aside>
    </div>
  )
}

function TaskPickerRow({
  selected,
  disabled,
  title,
  project,
  done,
  estimate,
  onSelect,
}: {
  selected: boolean
  disabled: boolean
  title: string
  project?: Project | null
  done?: number
  estimate?: number
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        className={`timer-picker-row${selected ? ' selected' : ''}`}
        disabled={disabled}
        onClick={onSelect}
      >
        <span className="timer-picker-mark" aria-hidden="true">
          {selected ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </span>
        <span className="timer-picker-copy">
          <span className="timer-picker-title">{title}</span>
          {project && (
            <span className="timer-picker-meta">
              <em style={{ background: project.color }} />
              {project.name}
            </span>
          )}
        </span>
        {estimate ? (
          <span className="timer-picker-count tabular">{done ?? 0}/{estimate}</span>
        ) : null}
      </button>
    </li>
  )
}

function TimerFace({
  phaseColor,
  phaseLabel,
  currentStep,
  totalDuration,
}: {
  phaseColor: string
  phaseLabel: string
  currentStep: number
  totalDuration: number
}) {
  const remainingSeconds = useTimerRemaining()
  const { t } = useI18n()
  const progress = totalDuration > 0 ? (totalDuration - remainingSeconds) / totalDuration : 0
  const steps: MessageKey[] = ['timer.step.focus', 'timer.step.shortBreak', 'timer.step.longBreak']

  return (
    <div className="timer-ring-wrapper" style={{ '--ring-progress': progress, '--ring-color': phaseColor } as CSSProperties}>
      <svg className="timer-ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle className="timer-ring-bg" cx="60" cy="60" r="54" />
        <circle
          className="timer-ring-progress"
          cx="60"
          cy="60"
          r="54"
          strokeLinecap="round"
        />
      </svg>
      <div className="timer-center">
        <div className="timer-remaining tabular">
          {formatDuration(remainingSeconds)}
        </div>
        <div className="timer-phase">{phaseLabel}</div>
        <div className="timer-steps" aria-hidden="true">
          {steps.map((key, index) => (
            <span key={key} className={`timer-step ${index === currentStep ? 'active' : ''}`}>
              {t(key)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
