import { useState, useMemo } from 'react'
import { CheckCircle2, Circle, Clock, Plus, Search, Trash2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useTimerStore } from '../../stores/timerStore'
import type { Priority, Task, Project, Tag } from '../../types'
import './task-panel.css'

const priorityMeta: Record<Priority, { label: string; color: string }> = {
  p1: { label: 'P1', color: '#E56B78' },
  p2: { label: 'P2', color: '#E8B05B' },
  p3: { label: 'P3', color: '#5FD4C7' },
  p4: { label: 'P4', color: '#8E99AA' },
}

export function TaskPanel() {
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [selectedProject, setSelectedProject] = useState<string | 'all'>('all')

  const { tasks, projects, tags, completeTask, uncompleteTask, deleteTask, addTask } = useAppStore()
  const startTimer = useTimerStore((s) => s.start)
  const activeTasks = tasks.filter((t) => t.status !== 'deleted')

  const filteredTasks = useMemo(() => {
    let list = activeTasks
    if (selectedProject !== 'all') {
      list = list.filter((t) => t.projectId === selectedProject)
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((t) => t.title.toLowerCase().includes(q))
    }
    return list.sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1
      if (a.status !== 'completed' && b.status === 'completed') return -1
      return a.sortKey - b.sortKey
    })
  }, [activeTasks, selectedProject, query])

  const completedCount = activeTasks.filter((t) => t.status === 'completed').length
  const progress = activeTasks.length > 0 ? Math.round((completedCount / activeTasks.length) * 100) : 0

  function handleAddTask(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !draft.trim()) return
    addTask({
      title: draft.trim(),
      projectId: selectedProject === 'all' ? 'work' : selectedProject,
      tagIds: [],
      priority: 'p2',
      dueAt: null,
      estimatePomodoros: 1,
    })
    setDraft('')
  }

  function handleToggle(task: Task) {
    if (task.status === 'completed') {
      uncompleteTask(task.id)
    } else {
      completeTask(task.id)
    }
  }

  return (
    <>
      <div className="panel-header">
        <div className="panel-title">
          <CheckCircle2 size={18} />
          待办事项
        </div>
        <div className="panel-subtitle">{progress}% 完成</div>
      </div>

      <div className="task-toolbar">
        <div className="search-box">
          <Search size={14} />
          <input
            type="text"
            placeholder="搜索任务..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="project-select"
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="all">全部项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="task-progress-bar">
        <div className="task-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="panel-body task-list">
        {filteredTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            projects={projects}
            tags={tags}
            onToggle={() => handleToggle(task)}
            onDelete={() => deleteTask(task.id)}
            onStart={() => startTimer(task.id)}
          />
        ))}
        {filteredTasks.length === 0 && (
          <div className="task-empty">
            <Circle size={32} strokeWidth={1.2} />
            <p>没有任务，添加一个吧</p>
          </div>
        )}
      </div>

      <div className="task-input-area">
        <Plus size={16} />
        <input
          type="text"
          placeholder="添加新任务，按 Enter 保存"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleAddTask}
        />
      </div>
    </>
  )
}

function TaskRow({
  task,
  projects,
  tags,
  onToggle,
  onDelete,
  onStart,
}: {
  task: Task
  projects: Project[]
  tags: Tag[]
  onToggle: () => void
  onDelete: () => void
  onStart: () => void
}) {
  const project = projects.find((p) => p.id === task.projectId)
  const completed = task.status === 'completed'

  return (
    <div className={`task-row ${completed ? 'completed' : ''}`}>
      <button className="task-check" onClick={onToggle}>
        {completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </button>

      <div className="task-main">
        <div className="task-title-row">
          <span className="task-title">{task.title}</span>
          <span
            className="task-priority"
            style={{ color: priorityMeta[task.priority].color, borderColor: priorityMeta[task.priority].color }}
          >
            {priorityMeta[task.priority].label}
          </span>
        </div>

        <div className="task-meta">
          {project && (
            <span className="task-project" style={{ color: project.color }}>
              {project.name}
            </span>
          )}
          {task.tagIds.length > 0 && (
            <span className="task-tags">
              {task.tagIds.map((tid) => {
                const tag = tags.find((t) => t.id === tid)
                return tag ? <span key={tid} className="task-tag">#{tag.name}</span> : null
              })}
            </span>
          )}
          {task.estimatePomodoros > 0 && (
            <span className="task-pomos">
              <Clock size={11} /> {Math.ceil(task.actualFocusSeconds / 60)} / {task.estimatePomodoros * 25} 分钟
            </span>
          )}
        </div>
      </div>

      <div className="task-actions">
        <button className="task-action" title="开始番茄" onClick={onStart}>
          <Clock size={15} />
        </button>
        <button className="task-action" title="删除" onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
