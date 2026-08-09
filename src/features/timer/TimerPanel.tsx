import { useEffect, useMemo } from 'react'
import { Pause, Play, RotateCcw, SkipForward, Clock, CheckCircle2 } from 'lucide-react'
import { useTimerStore } from '../../stores/timerStore'
import { useAppStore } from '../../stores/appStore'
import { formatDuration } from '../../lib/utils'
import { DEFAULT_TIMER_PROFILES } from '../../lib/data'
import './timer-panel.css'

export function TimerPanel() {
  const timer = useTimerStore()
  const { tasks, projects, timerProfiles } = useAppStore()

  useEffect(() => {
    const id = setInterval(() => {
      useTimerStore.getState().tick()
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const profile = timerProfiles.find((p) => p.id === timer.profileId) ?? DEFAULT_TIMER_PROFILES[0]
  const task = timer.taskId ? tasks.find((t) => t.id === timer.taskId) : null
  const project = task ? projects.find((p) => p.id === task.projectId) : null

  const totalDuration = useMemo(() => {
    if (timer.phase === 'short_break_running' || timer.phase === 'long_break_running') {
      return timer.phase === 'short_break_running' ? profile.shortBreakSeconds : profile.longBreakSeconds
    }
    return profile.focusSeconds
  }, [timer.phase, profile])

  const progress = totalDuration > 0 ? ((totalDuration - timer.remainingSeconds) / totalDuration) * 100 : 0

  const isRunning = timer.phase.endsWith('_running')
  const isPaused = timer.phase.endsWith('_paused')
  const isFocus = timer.phase.startsWith('focus') || timer.phase === 'idle'

  const phaseColor = isFocus ? 'var(--focus)' : 'var(--accent)'

  return (
    <>
      <div className="panel-header">
        <div className="panel-title">
          <Clock size={18} />
          番茄钟
        </div>
        <select
          className="timer-profile-select"
          value={timer.profileId}
          onChange={(e) => useTimerStore.getState().setProfile(e.target.value)}
        >
          {timerProfiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="panel-body timer-body">
        <div className="timer-ring-wrapper">
          <svg className="timer-ring" viewBox="0 0 120 120">
            <circle className="timer-ring-bg" cx="60" cy="60" r="54" />
            <circle
              className="timer-ring-progress"
              cx="60"
              cy="60"
              r="54"
              stroke={phaseColor}
              strokeDasharray={339.292}
              strokeDashoffset={339.292 * (1 - progress / 100)}
              strokeLinecap="round"
            />
          </svg>
          <div className="timer-center">
            <div className="timer-remaining tabular" style={{ color: phaseColor }}>
              {formatDuration(timer.remainingSeconds)}
            </div>
            <div className="timer-phase">
              {timer.phase === 'idle' && '准备专注'}
              {timer.phase === 'focus_running' && '专注中'}
              {timer.phase === 'focus_paused' && '专注已暂停'}
              {timer.phase === 'short_break_running' && '短休息'}
              {timer.phase === 'long_break_running' && '长休息'}
            </div>
          </div>
        </div>

        {task && (
          <div className="timer-task-card">
            <CheckCircle2 size={14} />
            <div className="timer-task-info">
              <span className="timer-task-title">{task.title}</span>
              {project && <span className="timer-task-project" style={{ color: project.color }}>{project.name}</span>}
            </div>
          </div>
        )}

        <div className="timer-controls">
          {!isRunning && !isPaused && (
            <button
              className="timer-btn primary"
              style={{ background: phaseColor, color: '#0B0E14' }}
              onClick={() => timer.start()}
            >
              <Play size={18} fill="currentColor" /> 开始专注
            </button>
          )}
          {(isRunning || isPaused) && (
            <button
              className="timer-btn primary"
              style={{ background: phaseColor, color: '#0B0E14' }}
              onClick={() => (isPaused ? timer.resume() : timer.pause())}
            >
              {isPaused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
              {isPaused ? '继续' : '暂停'}
            </button>
          )}
          <button className="timer-btn ghost" onClick={() => timer.skip()} disabled={timer.phase === 'idle'}>
            <SkipForward size={16} /> 跳过
          </button>
          <button className="timer-btn ghost" onClick={() => timer.reset()}>
            <RotateCcw size={16} /> 重置
          </button>
        </div>

        <div className="timer-stats">
          <div className="timer-stat">
            <div className="timer-stat-value">{timer.sessionCount}</div>
            <div className="timer-stat-label">完成番茄</div>
          </div>
          <div className="timer-stat">
            <div className="timer-stat-value tabular">{Math.floor((timer.sessionCount * profile.focusSeconds) / 60)}</div>
            <div className="timer-stat-label">今日分钟</div>
          </div>
          <div className="timer-stat">
            <div className="timer-stat-value">{profile.sessionsBeforeLongBreak}</div>
            <div className="timer-stat-label">长休间隔</div>
          </div>
        </div>
      </div>
    </>
  )
}
