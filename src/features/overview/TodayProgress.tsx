import { useI18n } from '../../i18n'

const RADIUS = 52
const STROKE = 16
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface Segment {
  key: string
  label: string
  value: number
  color: string
}

interface TodayProgressProps {
  completed: number
  active: number
  overdue: number
}

export function TodayProgress({ completed, active, overdue }: TodayProgressProps) {
  const { t } = useI18n()
  const segments: Segment[] = [
    { key: 'done', label: t('overview.progress.done'), value: completed, color: 'var(--accent)' },
    { key: 'doing', label: t('overview.progress.doing'), value: Math.max(0, active - overdue), color: 'var(--info)' },
    { key: 'overdue', label: t('overview.progress.overdue'), value: overdue, color: 'var(--danger)' },
  ]
  const total = segments.reduce((sum, item) => sum + item.value, 0)
  const rate = total === 0 ? 0 : Math.round((completed / total) * 100)

  let offset = 0
  const arcs = segments.map((segment) => {
    const length = total === 0 ? 0 : (segment.value / total) * CIRCUMFERENCE
    const arc = { ...segment, length, offset }
    offset += length
    return arc
  })

  return (
    <section className="card overview-progress">
      <div className="card-header">
        <div className="card-header-copy">
          <div className="card-title">{t('overview.progress.title')}</div>
          <div className="card-subheader">{t('overview.progress.subtitle')}</div>
        </div>
      </div>
      <div className="overview-progress-body">
        <div className="overview-donut">
          <svg viewBox="0 0 140 140" role="img" aria-label={t('overview.progress.aria', { rate })}>
            <circle
              className="overview-donut-track"
              cx="70"
              cy="70"
              r={RADIUS}
              strokeWidth={STROKE}
            />
            {arcs.map((arc) => (
              arc.length > 0 && (
                <circle
                  key={arc.key}
                  cx="70"
                  cy="70"
                  r={RADIUS}
                  strokeWidth={STROKE}
                  stroke={arc.color}
                  strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                  strokeDashoffset={-arc.offset}
                />
              )
            ))}
          </svg>
          <div className="overview-donut-center">
            <strong className="tabular">{rate}%</strong>
            <span>{t('overview.progress.center')}</span>
          </div>
        </div>
        <ul className="overview-legend">
          {segments.map((segment) => (
            <li key={segment.key}>
              <span className="overview-legend-dot" style={{ background: segment.color }} />
              <span className="overview-legend-label">{segment.label}</span>
              <span className="overview-legend-value tabular">{segment.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
