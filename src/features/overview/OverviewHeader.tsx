import { ListTodo, Play } from 'lucide-react'
import { useI18n } from '../../i18n'

interface OverviewHeaderProps {
  activeCount: number
  todayEventCount: number
  overdueCount: number
  onStartFocus: () => void
  onGoTasks: () => void
}

/**
 * 七个整句而不是拼接短语：中文「今天还有 3 项待办、2 个日程」和英文
 * 「You have 3 tasks and 2 events today」的语序、连接词、单复数都对不上，
 * 拼出来的句子只能有一种语言读着顺。
 */
function summaryKey(activeCount: number, todayEventCount: number, overdueCount: number) {
  const overdue = overdueCount > 0
  if (activeCount === 0 && todayEventCount === 0) return 'overview.summary.empty' as const
  if (activeCount > 0 && todayEventCount > 0) {
    return overdue ? 'overview.summary.bothOverdue' as const : 'overview.summary.both' as const
  }
  if (activeCount > 0) {
    return overdue ? 'overview.summary.tasksOverdue' as const : 'overview.summary.tasks' as const
  }
  return overdue ? 'overview.summary.eventsOverdue' as const : 'overview.summary.events' as const
}

export function OverviewHeader({
  activeCount,
  todayEventCount,
  overdueCount,
  onStartFocus,
  onGoTasks,
}: OverviewHeaderProps) {
  const { t } = useI18n()

  return (
    <header className="overview-header">
      <div className="overview-header-copy">
        <h1>{t('overview.welcome')}</h1>
        <p>
          {t(summaryKey(activeCount, todayEventCount, overdueCount), {
            tasks: activeCount,
            events: todayEventCount,
            overdue: overdueCount,
          })}
        </p>
      </div>
      <div className="overview-header-actions">
        <button type="button" className="primary-btn overview-header-action" onClick={onStartFocus}>
          <Play size={16} fill="currentColor" />
          {t('overview.action.startFocus')}
        </button>
        <button type="button" className="ghost-btn overview-header-action" onClick={onGoTasks}>
          <ListTodo size={16} />
          {t('overview.action.goTasks')}
        </button>
      </div>
    </header>
  )
}
