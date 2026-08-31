import type { LucideIcon } from 'lucide-react'

type Tone = 'primary' | 'info' | 'warning' | 'danger'

interface WidgetSummaryProps {
  title: string
  total: string | number
  caption: string
  icon: LucideIcon
  tone?: Tone
}

export function WidgetSummary({ title, total, caption, icon: Icon, tone = 'primary' }: WidgetSummaryProps) {
  return (
    <section className={`card widget-summary tone-${tone}`}>
      <div className="widget-summary-copy">
        <div className="widget-summary-total tabular">{total}</div>
        <div className="widget-summary-title">{title}</div>
        <div className="widget-summary-caption">{caption}</div>
      </div>
      <span className="widget-summary-icon" aria-hidden="true">
        <Icon size={24} strokeWidth={2} />
      </span>
      <span className="widget-summary-blob" aria-hidden="true" />
    </section>
  )
}
