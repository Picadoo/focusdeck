import { formatFocusDuration } from '../../lib/utils'
import { useI18n } from '../../i18n'
import type { Task } from '../../types'

interface FocusLeaderboardProps {
  tasks: Task[]
  onGoTimer: () => void
}

export function FocusLeaderboard({ tasks, onGoTimer }: FocusLeaderboardProps) {
  const { t } = useI18n()
  const max = tasks.reduce((peak, task) => Math.max(peak, task.actualFocusSeconds), 0)

  return (
    <section className="card overview-focus">
      <div className="card-header">
        <div className="card-header-copy">
          <div className="card-title">{t('overview.focus.title')}</div>
          <div className="card-subheader">{t('overview.focus.subtitle')}</div>
        </div>
        <button type="button" className="ghost-btn" onClick={onGoTimer}>
          {t('overview.action.startFocus')}
        </button>
      </div>
      <div className="card-content overview-focus-body">
        {tasks.length === 0 ? (
          <p className="overview-empty">{t('overview.focus.empty')}</p>
        ) : (
          <ul className="overview-focus-list">
            {tasks.map((task) => (
              <li key={task.id} className="overview-focus-item">
                <div className="overview-focus-head">
                  <span className="overview-focus-title">{task.title}</span>
                  <span className="overview-focus-value tabular">{formatFocusDuration(task.actualFocusSeconds)}</span>
                </div>
                <div className="overview-focus-track">
                  <span
                    className="overview-focus-bar"
                    style={{ width: `${max === 0 ? 0 : (task.actualFocusSeconds / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
