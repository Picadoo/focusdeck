import { useEffect, useRef, useState } from 'react'
import { Calendar, Clock, Flame, LayoutDashboard, ListTodo, Menu, X } from 'lucide-react'
import { useUIStore } from './stores/uiStore'
import { useTimerStore, useTimerRemaining } from './stores/timerStore'
import { useAppStore } from './stores/appStore'
import { formatClock, formatDate, formatDuration, formatWeekday } from './lib/utils'
import { useMinuteClock } from './lib/clock'
import { Workspace } from './features/workspace/Workspace'
import { TimerEngine } from './features/timer/TimerEngine'
import { TimerAlerts } from './features/timer/TimerAlerts'
import { SyncEngine } from './features/sync/SyncEngine'
import { SyncStatus } from './features/sync/SyncStatus'
import { LoginCard } from './features/sync/LoginCard'
import { NotificationCheckCard } from './features/sync/NotificationCheckCard'
import { BottomNav } from './features/nav/BottomNav'
import { LanguageSwitch } from './features/nav/LanguageSwitch'
import { useI18n, type MessageKey } from './i18n'
import { unlockAlertAudio } from './lib/alerts'
import { bindNativeReminderListeners } from './lib/nativeReminders'
import { bindNativeAppListeners, initNativeChrome } from './lib/nativeApp'
import { closeTopOverlay } from './lib/overlayStack'
import './styles/app.css'

const NAV_ITEMS = [
  { id: 'tasks' as const, labelKey: 'nav.tasks' as MessageKey, icon: ListTodo },
  { id: 'schedule' as const, labelKey: 'nav.schedule' as MessageKey, icon: Calendar },
  { id: 'timer' as const, labelKey: 'nav.timer' as MessageKey, icon: Clock },
  { id: 'overview' as const, labelKey: 'nav.overview' as MessageKey, icon: LayoutDashboard },
]

function HeaderClock() {
  const clock = useMinuteClock()
  const { t, locale } = useI18n()

  return (
    <div className="header-date">
      <p className="header-date-copy">
        {/* locale 只是让语言切换时重算日期串：formatWeekday/formatDate 读的是模块级当前语言 */}
        <span className="header-weekday" key={locale}>{formatWeekday(clock)}</span>
        <span className="header-date-dot" aria-hidden="true">·</span>
        <time className="header-date-label" dateTime={clock.toISOString()}>{formatDate(clock)}</time>
      </p>
      <time className="header-clock tabular" dateTime={clock.toISOString()} aria-label={t('a11y.currentTime')}>{formatClock(clock)}</time>
    </div>
  )
}

function HeaderTimerStatus() {
  const setViewMode = useUIStore((s) => s.setViewMode)
  const timerPhase = useTimerStore((s) => s.phase)
  const remainingSeconds = useTimerRemaining()
  const { t } = useI18n()

  if (timerPhase === 'idle') return null

  const timerStatusLabel = timerPhase.startsWith('focus')
    ? (timerPhase.endsWith('paused') ? t('timer.status.focusPaused') : t('timer.status.focus'))
    : timerPhase.startsWith('short_break')
      ? (timerPhase.endsWith('paused') ? t('timer.status.shortBreakPaused') : t('timer.status.shortBreak'))
      : (timerPhase.endsWith('paused') ? t('timer.status.longBreakPaused') : t('timer.status.longBreak'))

  return (
    <button className="timer-status" onClick={() => setViewMode('timer')} title={t('timer.status.open')}>
      <Clock size={18} />
      <span className="timer-status-copy">
        <span className="timer-status-label">{timerStatusLabel}</span>
        <span className="timer-status-time tabular">{formatDuration(remainingSeconds)}</span>
      </span>
    </button>
  )
}

export default function App() {
  const [navOpen, setNavOpen] = useState(false)
  const { t } = useI18n()
  const viewMode = useUIStore((s) => s.viewMode)
  const setViewMode = useUIStore((s) => s.setViewMode)
  const remainingTasks = useAppStore((s) => {
    let count = 0
    for (const task of s.tasks) if (task.status === 'active' && task.deletedAt == null) count += 1
    return count
  })
  const navOpenRef = useRef(navOpen)
  const viewModeRef = useRef(viewMode)
  navOpenRef.current = navOpen
  viewModeRef.current = viewMode

  useEffect(() => {
    setNavOpen(false)
  }, [viewMode])

  useEffect(() => {
    function onContextMenu(event: Event) {
      const e = event as PointerEvent
      const target = e.target
      if (!(target instanceof Element)) {
        e.preventDefault()
        return
      }

      if (target.closest('input, textarea, select, [contenteditable="true"]')) return

      const pointerType = e.pointerType
      if (pointerType === 'touch' || pointerType === 'pen') return
      if (!pointerType && window.matchMedia('(pointer: coarse)').matches) return

      e.preventDefault()
    }

    document.addEventListener('contextmenu', onContextMenu)
    return () => document.removeEventListener('contextmenu', onContextMenu)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Escape 得在输入框里也生效：弹层一聚焦输入框就再也关不掉。
      if (e.code === 'Escape') {
        if (closeTopOverlay()) {
          e.preventDefault()
          return
        }
        if (navOpenRef.current) setNavOpen(false)
        else if (viewModeRef.current === 'timer') setViewMode('tasks')
        return
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return

      const timer = useTimerStore.getState()
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          unlockAlertAudio()
          if (timer.phase === 'idle') timer.start()
          else if (timer.phase.endsWith('_running')) timer.pause()
          else if (timer.phase.endsWith('_paused')) timer.resume()
          break
        case 'KeyF':
          e.preventDefault()
          setViewMode('timer')
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setViewMode])

  useEffect(() => bindNativeReminderListeners(), [])

  useEffect(() => {
    void initNativeChrome()
    return bindNativeAppListeners({
      closeNav: () => {
        if (!navOpenRef.current) return false
        setNavOpen(false)
        return true
      },
      goHomeFromTimer: () => {
        if (viewModeRef.current !== 'timer') return false
        setViewMode('tasks')
        return true
      },
    })
  }, [setViewMode])

  return (
    <div className={`app-shell view-${viewMode}${navOpen ? ' nav-open' : ''}`}>
      <TimerEngine />
      <TimerAlerts />
      <SyncEngine />
      {navOpen && <button className="nav-backdrop" aria-label={t('a11y.closeNav')} onClick={() => setNavOpen(false)} />}

      <aside className="layout-nav" aria-label={t('a11y.mainNav')} aria-hidden={!navOpen} {...(!navOpen ? { inert: true } : {})}>
        <div className="layout-nav-brand">
          <span className="brand-mark" aria-hidden="true">
            <Flame className="brand-icon" />
          </span>
          <span className="brand-copy">
            <span className="brand-name">FocusDeck</span>
            <span className="brand-tag">{t('brand.tag')}</span>
          </span>
        </div>

        <nav className="layout-nav-section">
          <div className="nav-subheader">{t('nav.section.workspace')}</div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = viewMode === item.id
            return (
              <button
                key={item.id}
                className={`nav-item ${active ? 'active' : ''}`}
                data-view={item.id}
                aria-pressed={active}
                onClick={() => setViewMode(item.id)}
              >
                <span className="nav-item-icon">
                  <Icon size={24} />
                </span>
                <span className="nav-item-title">{t(item.labelKey)}</span>
                {item.id === 'tasks' && remainingTasks > 0 && (
                  <span className="nav-item-info">{remainingTasks}</span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="layout-nav-upgrade">
          <strong>{t('nav.promo.title')}</strong>
          <p>{t('nav.promo.body')}</p>
          <button className="primary-btn" onClick={() => setViewMode('timer')}>
            {t('nav.promo.cta')}
          </button>
        </div>
        <LoginCard />
        <NotificationCheckCard />
      </aside>

      <div className="layout-sidebar-container">
        <header className="layout-header">
          <div className="layout-header-left">
            <button
              className="menu-btn"
              aria-expanded={navOpen}
              aria-label={navOpen ? t('a11y.collapseNav') : t('a11y.openNav')}
              onClick={() => setNavOpen((open) => !open)}
            >
              {navOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <HeaderClock />
          </div>

          <nav className="header-tabs" aria-label={t('a11y.headerTabs')}>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = viewMode === item.id
              return (
                <button
                  key={item.id}
                  className={`header-tab ${active ? 'active' : ''}`}
                  data-view={item.id}
                  aria-pressed={active}
                  onClick={() => setViewMode(item.id)}
                >
                  <Icon size={16} />
                  <span>{t(item.labelKey)}</span>
                </button>
              )
            })}
          </nav>

          <div className="layout-header-right">
            <LanguageSwitch />
            <SyncStatus />
            <HeaderTimerStatus />
          </div>
        </header>

        <main className="layout-main">
          <div className="dashboard-content">
            <Workspace />
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
