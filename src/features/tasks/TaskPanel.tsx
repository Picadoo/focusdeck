import type { DraggableSyntheticListeners } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarClock, CheckCircle2, Circle, Clock, Flag, Folder, GripVertical, Plus, Timer, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { registerOverlay } from '../../lib/overlayStack'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../stores/appStore'
import { useTimerStore } from '../../stores/timerStore'
import { useUIStore } from '../../stores/uiStore'
import { useCalendarDayKey } from '../../lib/clock'
import { compareTasksByDue, dateKeyToDate, dueUrgency, formatDueLabel, parseDueDate, toDateTimeLocal } from '../../lib/utils'
import { useI18n } from '../../i18n'
import type { Priority, Project, Task } from '../../types'
import './task-panel.css'

const priorityMeta: Record<Priority, { label: string; color: string }> = {
  p1: { label: 'P1', color: '#FF5630' },
  p2: { label: 'P2', color: '#FFAB00' },
  p3: { label: 'P3', color: '#22C55E' },
  p4: { label: 'P4', color: '#637381' },
}

interface TaskPanelProps {
  compact?: boolean
}

export function TaskPanel({ compact = false }: TaskPanelProps) {
  const [draft, setDraft] = useState('')
  const [draftProjectId, setDraftProjectId] = useState('work')
  const [draftPriority, setDraftPriority] = useState<Priority>('p2')
  const [draftDue, setDraftDue] = useState('')
  const [draftPomodoros, setDraftPomodoros] = useState(1)
  const [selectedProject, setSelectedProject] = useState<string | 'all'>('all')
  const [composerOpen, setComposerOpen] = useState(false)

  const { tasks, projects, completeTask, uncompleteTask, deleteTask, addTask } = useAppStore(useShallow((s) => ({
    tasks: s.tasks,
    projects: s.projects,
    completeTask: s.completeTask,
    uncompleteTask: s.uncompleteTask,
    deleteTask: s.deleteTask,
    addTask: s.addTask,
  })))
  const startTimer = useTimerStore((s) => s.start)
  const setViewMode = useUIStore((s) => s.setViewMode)
  const { t } = useI18n()
  const todayKey = useCalendarDayKey()
  const today = useMemo(() => dateKeyToDate(todayKey) ?? new Date(), [todayKey])
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])

  const { remainingCount, progress, filteredTasks, sortableIds, activeCount } = useMemo(() => {
    const activeTasks = tasks.filter((t) => t.status !== 'deleted' && t.deletedAt == null)
    const completedCount = activeTasks.filter((t) => t.status === 'completed').length
    const remainingCount = activeTasks.length - completedCount
    const progress = activeTasks.length > 0 ? Math.round((completedCount / activeTasks.length) * 100) : 0
    const filteredTasks = [...(selectedProject === 'all' ? activeTasks : activeTasks.filter((t) => t.projectId === selectedProject))]
      .sort(compareTasksByDue)
    return {
      remainingCount,
      progress,
      filteredTasks,
      sortableIds: filteredTasks.map((t) => t.id),
      activeCount: activeTasks.length,
    }
  }, [selectedProject, tasks])

  const composerExpanded = composerOpen || Boolean(draft.trim())
  useEffect(() => {
    if (!composerExpanded) return
    return registerOverlay(() => {
      setComposerOpen(false)
      setDraft('')
      return true
    })
  }, [composerExpanded])

  function handleFilterProject(value: string) {
    setSelectedProject(value)
    if (value !== 'all') setDraftProjectId(value)
  }

  function submitTask() {
    if (!draft.trim()) return
    addTask({
      title: draft.trim(),
      projectId: draftProjectId,
      tagIds: [],
      priority: draftPriority,
      dueAt: parseDueDate(draftDue),
      estimatePomodoros: Math.max(1, Number(draftPomodoros) || 1),
    })
    setDraft('')
    setDraftDue('')
    setDraftPomodoros(1)
    setComposerOpen(false)
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    submitTask()
  }

  function handleToggle(task: Task) {
    if (task.status === 'completed') uncompleteTask(task.id)
    else completeTask(task.id)
  }

  function handleStartTimer(taskId: string) {
    startTimer(taskId)
    setViewMode('timer')
  }

  return (
    <div className={`task-panel${compact ? ' compact' : ''}`}>
      <div className="card-header task-panel-header">
        <div className="card-header-copy">
          <div className="card-title">{t('tasks.title')}</div>
          {/* 筛选跟标题同行：原来它独占一整行，吃掉的正是任务列表的位置 */}
          <div className="task-project-filter" role="group" aria-label={t('a11y.filterByProject')}>
            <button
              type="button"
              className={`task-filter-chip all${selectedProject === 'all' ? ' active' : ''}`}
              aria-pressed={selectedProject === 'all'}
              onClick={() => handleFilterProject('all')}
            >
              {t('common.all')}
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`task-filter-chip${selectedProject === project.id ? ' active' : ''}`}
                style={{ ['--chip-accent']: project.color } as CSSProperties}
                aria-pressed={selectedProject === project.id}
                onClick={() => handleFilterProject(project.id)}
              >
                {project.name}
              </button>
            ))}
          </div>
        </div>
        <div className="task-progress-meta">
          <div className="task-progress-value">{progress}%</div>
          <div className="task-progress-caption">
            {activeCount === 0
              ? t('tasks.progress.empty')
              : t('tasks.progress.remaining', { count: remainingCount })}
          </div>
        </div>
      </div>

      <div className="task-progress-bar" aria-label={t('a11y.completedPercent', { progress })}>
        <div className="task-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="task-list">
          {filteredTasks.map((task) => (
            <SortableTaskRow
              key={task.id}
              task={task}
              projectById={projectById}
              today={today}
              onToggle={() => handleToggle(task)}
              onDelete={() => deleteTask(task.id)}
              onStart={() => handleStartTimer(task.id)}
            />
          ))}
          {filteredTasks.length === 0 && (
            <div className="task-empty">
              <Circle size={40} strokeWidth={1.4} />
              <p>{selectedProject !== 'all' ? t('tasks.empty.projectTitle') : t('tasks.empty.title')}</p>
              <span>
                {selectedProject !== 'all'
                  ? t('tasks.empty.projectHint')
                  : t('tasks.empty.hint')}
              </span>
            </div>
          )}
        </div>
      </SortableContext>

      <form
        className={`task-composer${compact ? ' compact' : ''}${composerOpen || draft.trim() ? ' expanded' : ''}`}
        onSubmit={handleAddTask}
      >
        <label className="task-composer-title">
          <Plus size={20} />
          <input
            type="text"
            placeholder={t('tasks.composer.placeholder')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setComposerOpen(true)}
            aria-label={t('a11y.taskTitle')}
          />
        </label>

        <div className="task-composer-fields">
          <label>
            <span><Folder size={14} /> {t('tasks.field.project')}</span>
            <select
              value={draftProjectId}
              onChange={(e) => setDraftProjectId(e.target.value)}
              aria-label={t('a11y.taskProject')}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span><Flag size={14} /> {t('tasks.field.priority')}</span>
            <select
              value={draftPriority}
              onChange={(e) => setDraftPriority(e.target.value as Priority)}
              aria-label={t('a11y.taskPriority')}
            >
              {(['p1', 'p2', 'p3', 'p4'] as Priority[]).map((priority) => (
                <option key={priority} value={priority}>{priorityMeta[priority].label}</option>
              ))}
            </select>
          </label>
          <label>
            <span><CalendarClock size={14} /> {t('tasks.field.due')}</span>
            <input
              type="datetime-local"
              value={draftDue}
              onChange={(e) => setDraftDue(e.target.value)}
              aria-label={t('a11y.taskDue')}
            />
          </label>
          <label>
            <span><Timer size={14} /> {t('tasks.field.pomodoro')}</span>
            <input
              type="number"
              min={1}
              max={16}
              value={draftPomodoros}
              onChange={(e) => setDraftPomodoros(Number(e.target.value))}
              aria-label={t('a11y.taskPomodoro')}
            />
          </label>
        </div>

        <div className="task-composer-actions">
          <button type="submit" className="primary-btn" disabled={!draft.trim()}>
            {t('tasks.composer.submit')}
          </button>
        </div>
      </form>
    </div>
  )
}

function SortableTaskRow({
  task,
  projectById,
  today,
  onToggle,
  onDelete,
  onStart,
}: {
  task: Task
  projectById: Map<string, Project>
  today: Date
  onToggle: () => void
  onDelete: () => void
  onStart: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.48 : 1,
    zIndex: isDragging ? 100 : 'auto',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskRow
        task={task}
        projectById={projectById}
        today={today}
        dragHandleProps={listeners}
        onToggle={onToggle}
        onDelete={onDelete}
        onStart={onStart}
      />
    </div>
  )
}

function TaskRow({
  task,
  projectById,
  today,
  dragHandleProps,
  onToggle,
  onDelete,
  onStart,
}: {
  task: Task
  projectById: Map<string, Project>
  today: Date
  dragHandleProps?: DraggableSyntheticListeners
  onToggle: () => void
  onDelete: () => void
  onStart: () => void
}) {
  const { t } = useI18n()
  const project = projectById.get(task.projectId)
  const completed = task.status === 'completed'

  return (
    <div className={`task-row ${completed ? 'completed' : ''}`}>
      <button className="task-drag-handle" title={t('tasks.dragHandle')} {...dragHandleProps}>
        <GripVertical size={24} />
      </button>

      <button className="task-check" onClick={onToggle} aria-label={completed ? t('tasks.markIncomplete') : t('tasks.markComplete')}>
        {completed ? <CheckCircle2 size={30} /> : <Circle size={30} />}
      </button>

      <div className="task-main">
        <div className="task-title-row">
          <span className="task-title">{task.title}</span>
          <span
            className="task-priority"
            title={priorityMeta[task.priority].label}
            style={{ color: priorityMeta[task.priority].color }}
          >
            <Flag size={16} />
          </span>
        </div>

        <div className="task-meta">
          {project && (
            <span className="task-project" title={project.name}>
              <span className="task-project-dot" style={{ background: project.color }} />
              {project.name}
            </span>
          )}
          {task.dueAt != null && (
            <span className={`task-due ${dueUrgency(task.dueAt, today)}`} title={toDateTimeLocal(task.dueAt, today)}>
              <CalendarClock size={20} />
              {formatDueLabel(task.dueAt, today)}
            </span>
          )}
          {task.estimatePomodoros > 0 && (
            <span className="task-pomos" title={t('tasks.pomoTitle', { done: Math.ceil(task.actualFocusSeconds / 60), total: task.estimatePomodoros * 25 })}>
              <Timer size={20} />
              {Math.ceil(task.actualFocusSeconds / 60)}/{task.estimatePomodoros * 25}
            </span>
          )}
        </div>
      </div>

      <div className="task-actions">
        {!completed && (
          <button className="task-action task-action-focus" title={t('tasks.startPomodoro')} aria-label={t('tasks.startPomodoro')} onClick={onStart}>
            <Clock size={18} />
          </button>
        )}
        <button className="task-action" title={t('tasks.delete')} onClick={onDelete} aria-label={t('tasks.delete')}>
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  )
}

export function DraggableTaskItem({ task, projects }: { task: Task; projects: Project[] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, data: { task } })
  const project = projects.find((p) => p.id === task.projectId)
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="draggable-task-chip">
      <GripVertical size={16} />
      <span className="chip-title">{task.title}</span>
      {project && <span className="chip-dot" style={{ background: project.color }} />}
    </div>
  )
}
