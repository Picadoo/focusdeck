import { useEffect, useMemo, useState } from 'react'
import { registerOverlay } from '../../lib/overlayStack'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useShallow } from 'zustand/react/shallow'
import { AlertTriangle, CalendarClock, ListChecks, Timer } from 'lucide-react'
import { TaskPanel, DraggableTaskItem } from '../tasks/TaskPanel'
import { SchedulePanel } from '../schedule/SchedulePanel'
import { ScheduleSummary } from '../schedule/ScheduleSummary'
import { TimerPanel } from '../timer/TimerPanel'
import { OverviewHeader } from '../overview/OverviewHeader'
import { WidgetSummary } from '../overview/WidgetSummary'
import { TodayProgress } from '../overview/TodayProgress'
import { TodayTimeline } from '../overview/TodayTimeline'
import { UpcomingList } from '../overview/UpcomingList'
import { FocusLeaderboard } from '../overview/FocusLeaderboard'
import { useOverviewStats } from '../overview/useOverviewStats'
import { useAppStore } from '../../stores/appStore'
import { useUIStore } from '../../stores/uiStore'
import { useI18n } from '../../i18n'
import type { Task } from '../../types'
import '../overview/overview.css'
import './workspace.css'

export function Workspace() {
  const viewMode = useUIStore((s) => s.viewMode)
  if (viewMode === 'timer') return <TimerWorkspace />
  if (viewMode === 'overview') return <OverviewWorkspace />
  return <BoardWorkspace viewMode={viewMode} />
}

function TimerWorkspace() {
  const setViewMode = useUIStore((s) => s.setViewMode)
  return (
    <div className="workspace view-timer">
      <TimerPanel fullScreen onBack={() => setViewMode('tasks')} />
    </div>
  )
}

function OverviewWorkspace() {
  const setViewMode = useUIStore((s) => s.setViewMode)
  const stats = useOverviewStats()
  const { t } = useI18n()
  const focusHours = stats.totalFocusSeconds / 3600

  return (
    <div className="workspace view-overview">
      <div className="overview-main">
        <OverviewHeader
          activeCount={stats.activeCount}
          todayEventCount={stats.todayEventCount}
          overdueCount={stats.overdueCount}
          onStartFocus={() => setViewMode('timer')}
          onGoTasks={() => setViewMode('tasks')}
        />
        <div className="workspace-metrics">
          <WidgetSummary
            title={t('overview.metric.tasks.title')}
            total={stats.activeCount}
            caption={stats.totalCount === 0
              ? t('overview.metric.tasks.empty')
              : t('overview.metric.tasks.total', { count: stats.totalCount })}
            icon={ListChecks}
            tone="primary"
          />
          <WidgetSummary
            title={t('overview.metric.events.title')}
            total={stats.todayEventCount}
            caption={stats.todayEventMinutes === 0
              ? t('overview.metric.events.empty')
              : t('overview.metric.events.total', { minutes: stats.todayEventMinutes })}
            icon={CalendarClock}
            tone="info"
          />
          <WidgetSummary
            title={t('overview.metric.pomodoro.title')}
            total={stats.sessionCount}
            caption={t('overview.metric.pomodoro.caption')}
            icon={Timer}
            tone="warning"
          />
          <WidgetSummary
            title={t('overview.metric.overdue.title')}
            total={stats.overdueCount}
            caption={stats.overdueCount === 0
              ? t('overview.metric.overdue.none')
              : t('overview.metric.overdue.some')}
            icon={AlertTriangle}
            tone="danger"
          />
        </div>
        <TodayTimeline items={stats.timeline} onGoSchedule={() => setViewMode('schedule')} />
        <FocusLeaderboard tasks={stats.focusTop} onGoTimer={() => setViewMode('timer')} />
      </div>
      <aside className="overview-side">
        <TodayProgress
          completed={stats.completedCount}
          active={stats.activeCount}
          overdue={stats.overdueCount}
        />
        <UpcomingList tasks={stats.upcoming} onGoTasks={() => setViewMode('tasks')} />
        <section className="card overview-focus-total">
          <div className="overview-focus-total-label">{t('overview.focusTotal.label')}</div>
          <div className="overview-focus-total-value tabular">
            {focusHours >= 1 ? focusHours.toFixed(1) : Math.round(stats.totalFocusSeconds / 60)}
            <span>{focusHours >= 1 ? t('unit.hours') : t('unit.minutes')}</span>
          </div>
          <div className="overview-focus-total-caption">{t('overview.focusTotal.caption')}</div>
        </section>
      </aside>
    </div>
  )
}

function BoardWorkspace({ viewMode }: { viewMode: 'tasks' | 'schedule' }) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [tasksOpen, setTasksOpen] = useState(false)
  const { t } = useI18n()
  const { tasks, projects, reorderTasks } = useAppStore(useShallow((s) => ({
    tasks: s.tasks,
    projects: s.projects,
    reorderTasks: s.reorderTasks,
  })))
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 16 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragStart(event: DragStartEvent) {
    const task = taskById.get(String(event.active.id))
    if (task) setActiveTask(task)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return
    if (!taskById.has(activeId) || !taskById.has(overId)) return

    reorderTasks(activeId, overId)
  }

  useEffect(() => {
    setTasksOpen(false)
  }, [viewMode])

  useEffect(() => {
    if (viewMode !== 'schedule' || !tasksOpen) return
    return registerOverlay(() => {
      setTasksOpen(false)
      return true
    })
  }, [tasksOpen, viewMode])

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={`workspace view-${viewMode}${viewMode === 'schedule' && tasksOpen ? ' tasks-open' : ''}`}>
        {viewMode === 'schedule' ? (
          <>
            <section className="card schedule-shell">
              <SchedulePanel
                tasksOpen={tasksOpen}
                onToggleTasks={() => setTasksOpen((open) => !open)}
              />
            </section>
            {tasksOpen && (
              <button
                type="button"
                className="schedule-tasks-backdrop"
                aria-label={t('a11y.closeTasks')}
                onClick={() => setTasksOpen(false)}
              />
            )}
            <section
              id="schedule-tasks-drawer"
              className={`card workspace-task-card${tasksOpen ? ' open' : ''}`}
              aria-hidden={!tasksOpen}
            >
              <TaskPanel compact />
            </section>
          </>
        ) : (
          <>
            <section className="card workspace-task-card">
              <TaskPanel />
            </section>
            <section className="card workspace-secondary-card">
              <ScheduleSummary />
            </section>
          </>
        )}
      </div>
      <DragOverlay>
        {activeTask ? <DraggableTaskItem task={activeTask} projects={projects} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
