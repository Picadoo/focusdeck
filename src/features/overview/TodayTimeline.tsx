import { CalendarDays, CircleCheck } from 'lucide-react'
import { minutesToTimeLabel } from '../../lib/utils'
import { useI18n } from '../../i18n'
import type { TimelineItem } from './useOverviewStats'

interface TodayTimelineProps {
  items: TimelineItem[]
  onGoSchedule: () => void
}

export function TodayTimeline({ items, onGoSchedule }: TodayTimelineProps) {
  const { t } = useI18n()

  return (
    <section className="card overview-timeline">
      <div className="card-header">
        <div className="card-header-copy">
          <div className="card-title">{t('overview.timeline.title')}</div>
          <div className="card-subheader">{t('overview.timeline.subtitle')}</div>
        </div>
        <button type="button" className="ghost-btn" onClick={onGoSchedule}>
          {t('overview.action.goSchedule')}
        </button>
      </div>
      <div className="card-content overview-timeline-body">
        {items.length === 0 ? (
          <p className="overview-empty">{t('overview.timeline.empty')}</p>
        ) : (
          <ol className="overview-timeline-list">
            {items.map((item) => (
              <li key={item.key} className={`overview-timeline-item kind-${item.kind}${item.overdue ? ' overdue' : ''}`}>
                <span className="overview-timeline-time tabular">{minutesToTimeLabel(item.minutes)}</span>
                <span className="overview-timeline-marker" aria-hidden="true">
                  {item.kind === 'event' ? <CalendarDays size={14} /> : <CircleCheck size={14} />}
                </span>
                <span className="overview-timeline-copy">
                  <span className="overview-timeline-title">{item.title}</span>
                  <span className="overview-timeline-detail">
                    {item.overdue ? `${t('overview.timeline.overdue')} · ` : ''}
                    {item.detail}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
