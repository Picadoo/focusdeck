import { Calendar, Clock, Flame, LayoutGrid, ListTodo, Maximize2, Minimize2, Moon, Search, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatClock, formatDate } from './lib/utils'
import { useUIStore } from './stores/uiStore'
import { useTimerStore } from './stores/timerStore'
import { TaskPanel } from './features/tasks/TaskPanel'
import { TimerPanel } from './features/timer/TimerPanel'
import { SchedulePanel } from './features/schedule/SchedulePanel'
import './styles/app.css'

export default function App() {
  const [clock, setClock] = useState(new Date())
  const { immersive, toggleImmersive } = useUIStore()

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const timer = useTimerStore.getState()
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          if (timer.phase === 'idle') timer.start()
          else if (timer.phase.endsWith('_running')) timer.pause()
          else if (timer.phase.endsWith('_paused')) timer.resume()
          break
        case 'KeyF':
          toggleImmersive()
          break
        case 'Escape':
          if (immersive) toggleImmersive()
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [immersive, toggleImmersive])

  return (
    <div className={`app-shell ${immersive ? 'immersive' : ''}`}>
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <Flame className="brand-icon" />
            <span className="brand-name">FocusDeck</span>
          </div>
          <div className="date-group">
            <span className="date-label">{formatDate(clock)}</span>
            <span className="clock-label tabular">{formatClock(clock)}</span>
          </div>
        </div>

        <div className="topbar-center">
          <button className="segment-btn active">
            <LayoutGrid size={16} />
            仪表盘
          </button>
          <button className="segment-btn">
            <ListTodo size={16} />
            待办
          </button>
          <button className="segment-btn">
            <Calendar size={16} />
            日程
          </button>
          <button className="segment-btn">
            <Clock size={16} />
            番茄
          </button>
        </div>

        <div className="topbar-right">
          <button className="icon-btn" title="搜索">
            <Search size={18} />
          </button>
          <button className="icon-btn" title="主题">
            <Moon size={18} />
          </button>
          <button className="icon-btn" title="专注模式" onClick={toggleImmersive}>
            {immersive ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button className="icon-btn" title="设置">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="dashboard">
        <section className="panel task-panel">
          <TaskPanel />
        </section>

        <section className="panel schedule-panel">
          <SchedulePanel />
        </section>

        <section className="panel timer-panel">
          <TimerPanel />
        </section>
      </main>
    </div>
  )
}
