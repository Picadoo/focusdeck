import { Calendar, Clock, LayoutDashboard, ListTodo } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useI18n, type MessageKey } from '../../i18n'
import '../sync/sync.css'

const ITEMS = [
  { id: 'tasks' as const, labelKey: 'nav.tasks' as MessageKey, icon: ListTodo },
  { id: 'schedule' as const, labelKey: 'nav.schedule' as MessageKey, icon: Calendar },
  { id: 'timer' as const, labelKey: 'nav.timer' as MessageKey, icon: Clock },
  { id: 'overview' as const, labelKey: 'nav.overview' as MessageKey, icon: LayoutDashboard },
]

export function BottomNav() {
  const viewMode = useUIStore((s) => s.viewMode)
  const setViewMode = useUIStore((s) => s.setViewMode)
  const { t } = useI18n()

  return (
    <nav className="bottom-nav" aria-label={t('a11y.mobileNav')}>
      {ITEMS.map((item) => {
        const Icon = item.icon
        const active = viewMode === item.id
        return (
          <button
            key={item.id}
            type="button"
            className={active ? 'active' : ''}
            aria-pressed={active}
            onClick={() => setViewMode(item.id)}
          >
            <Icon size={20} />
            <span>{t(item.labelKey)}</span>
          </button>
        )
      })}
    </nav>
  )
}
