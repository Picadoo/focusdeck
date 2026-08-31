import { dueUrgency, formatDueLabel } from '../../lib/utils'
import { useI18n } from '../../i18n'
import type { Task } from '../../types'

interface UpcomingListProps {
  tasks: Task[]
  onGoTasks: () => void
}

export function UpcomingList({ tasks, onGoTasks }: UpcomingListProps) {
  const { t } = useI18n()

  return (
    <section className="card overview-upcoming">
      <div className="card-header">
        <div className="card-header-copy">
          <div className="card-title">{t('overview.upcoming.title')}</div>
          <div className="card-subheader">{t('overview.upcoming.subtitle')}</div>
        </div>
        <button type="button" className="ghost-btn" onClick={onGoTasks}>
          {t('overview.action.goTasks')}
        </button>
      </div>
      <div className="card-content overview-upcoming-body">
        {tasks.length === 0 ? (
          <p className="overview-empty">{t('overview.upcoming.empty')}</p>
        ) : (
          <ul className="overview-upcoming-list">
            {tasks.map((task) => (
              <li key={task.id} className={`overview-upcoming-item urgency-${dueUrgency(task.dueAt)}`}>
                <span className="overview-upcoming-title">{task.title}</span>
                <span className="overview-upcoming-due tabular">{formatDueLabel(task.dueAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
