import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ListTodo, Maximize2, Minimize2, Pencil, PencilOff, Plus, Repeat, Trash2, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { registerOverlay } from '../../lib/overlayStack'
import { useAppStore } from '../../stores/appStore'
import { useTimerStore } from '../../stores/timerStore'
import { useUIStore } from '../../stores/uiStore'
import { useCalendarDayKey, useMinuteClock } from '../../lib/clock'
import {
  addLocalDays,
  dateKeyToDate,
  eventOccursOnDate,
  getDayIndexFromDate,
  getWeekStart,
  minutesToTimeInput,
  minutesToTimeLabel,
  parseTimeToMinutes,
  toDateKey,
} from '../../lib/utils'
import { weekDays, weekDaysShort } from '../../lib/data'
import { t, useI18n } from '../../i18n'
import type { Project, ScheduleEvent, Task } from '../../types'
import './schedule-panel.css'

/**
 * 列头（星期 + 日期）高度。这个值同时决定 CSS 变量、pointToSlot 的换算原点和
 * 当前时刻线的位置，所以**只能有一个来源**——CSS 里曾另写过一份 48px 的手机档，
 * 被这里下发的内联变量静默盖掉，失效了很久也没人发现。
 */
const WEEK_HEADER_HEIGHT = 64
const WEEK_HEADER_HEIGHT_NARROW = 48
/** 日视图不画列头：那一行的日期，面板标题里已经写全了，手机上重复一遍白吃 64px。 */
const DAY_HEADER_HEIGHT = 0
const NARROW_BODY_WIDTH = 760

function headerHeightFor(layoutMode: 'day' | 'week', bodyWidth: number) {
  if (layoutMode === 'day') return DAY_HEADER_HEIGHT
  return bodyWidth > 0 && bodyWidth <= NARROW_BODY_WIDTH ? WEEK_HEADER_HEIGHT_NARROW : WEEK_HEADER_HEIGHT
}

/**
 * 下限按「半小时事件仍可读」倒推：72/2 = 36px，正好容下一行 13px 标题 + 同行时间。
 * 压到 44 时半小时只有 22px，会掉进 dense 档把字号降到 12.5px——而典型的 15 小时
 * 窗口本来就摊不进一屏，压了也照样滚，等于白付代价。
 */
const MIN_HOUR_HEIGHT = 72
const MAX_HOUR_HEIGHT = 96
const FALLBACK_HOUR_HEIGHT = 72
/** 拖拽吸附粒度（分钟）。 */
const SNAP = 15
/** 低于这个位移量视作点击而非拖拽。 */
const CLICK_SLOP_PX = 4
/** 触屏轻点的容忍位移，超过就当成滚动手势。 */
const TOUCH_SLOP_PX = 8
/** 自适应窗口在最早/最晚事件之外各留的余量（小时）。 */
const WINDOW_PAD_HOURS = 1
const WINDOW_MIN_SPAN_HOURS = 6
const FALLBACK_WINDOW_START = 8
const FALLBACK_WINDOW_END = 22
const EVENT_GUTTER_PX = 3
const EVENT_GAP_PX = 2
/** 单行卡片（标题与时间挤一行）同时放下「起–止」和四个字标题所需的最小列宽 */
const COMPACT_RANGE_MIN_WIDTH = 190
/**
 * 高卡片里时间独占一行，需要的宽度小得多，但**不是不需要**：
 * 「10:00 – 11:00」12px 字宽约 78px，加左右各 10px 内边距要 98px。
 * 原先只给单行档做了这个判断，高卡片一律渲染整段区间，
 * 七列平板上列宽只有 100px 时就被从中间切断。
 */
const STACKED_RANGE_MIN_WIDTH = 112
/**
 * 窄到这个宽度以下就换紧凑皮肤。横向和纵向一样有「压不下去的下限」：
 * box-sizing: border-box 下，内边距 + 边框（10+10+2）就是卡片的最小宽 22px，
 * 槽位比它还窄时浏览器会把宽度顶回去，卡片挤出自己的列、和邻居物理重叠。
 * 手机切到七列周视图再撞上四路冲突，单张槽位只有 8px，正是这个情况。
 */
const NARROW_SLOT_WIDTH = 56
/**
 * 再窄下去连一个字都排不下，标题会被逐字竖排成一列，读起来像乱码。
 * 这时候干脆只留色块——「这个时段有东西」本来就是七列视图唯一能表达的信息，
 * 细节交给点开看。
 */
const SLIVER_SLOT_WIDTH = 26
/** 列窄到放不下「周一」+ 日期圆点并排时，列头改成竖排 + 单字星期。 */
const COMPACT_COLUMN_WIDTH = 72

function relativeOffsetLabel(offset: number, unit: 'day' | 'week') {
  const near = unit === 'day'
    ? {
      1: t('schedule.offset.tomorrow'),
      [-1]: t('schedule.offset.yesterday'),
      2: t('schedule.offset.dayAfter'),
      [-2]: t('schedule.offset.dayBefore'),
    }
    : { 1: t('schedule.offset.nextWeek'), [-1]: t('schedule.offset.lastWeek') }
  const hit = near[offset as keyof typeof near]
  if (hit) return hit
  const count = Math.abs(offset)
  if (unit === 'day') {
    return offset > 0 ? t('schedule.offset.daysLater', { count }) : t('schedule.offset.daysAgo', { count })
  }
  return offset > 0 ? t('schedule.offset.weeksLater', { count }) : t('schedule.offset.weeksAgo', { count })
}
const EMPTY_EVENTS: ScheduleEvent[] = []
const FALLBACK_EVENT_COLOR = '#00A76F'

type EventLayout = {
  event: ScheduleEvent
  top: number
  height: number
  col: number
  cols: number
}

type DragState =
  | { kind: 'create'; col: number; anchor: number; current: number; moved: boolean }
  | { kind: 'move'; eventId: string; col: number; start: number; duration: number; grabOffset: number; moved: boolean }
  | { kind: 'resize'; eventId: string; col: number; start: number; end: number; moved: boolean }

type DraftEvent = {
  id: string | null
  title: string
  projectId: string
  date: string
  start: number
  end: number
  repeat: boolean
  createTask: boolean
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function snapMinutes(value: number) {
  return Math.round(value / SNAP) * SNAP
}

/**
 * 扫描线分列 + 并查集聚簇：重叠的事件并排铺开，互不重叠的各自占满整列。
 * 这段是改造前就有的逻辑，行为正确，原样保留。
 */
function layoutDayEvents(
  events: ScheduleEvent[],
  startHour: number,
  endHour: number,
  hourHeight: number,
): EventLayout[] {
  const windowStart = startHour * 60
  const windowEnd = endHour * 60
  const items = events
    .map((event) => {
      const start = Math.max(event.startMinutes, windowStart)
      const end = Math.min(event.startMinutes + event.durationMinutes, windowEnd)
      if (end <= start) return null
      return {
        event,
        start,
        end,
        top: ((start - windowStart) / 60) * hourHeight,
        height: ((end - start) / 60) * hourHeight,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const columnEnds: number[] = []
  const placed = items.map((item) => {
    let col = 0
    while (col < columnEnds.length && columnEnds[col] > item.start) col += 1
    if (col === columnEnds.length) columnEnds.push(item.end)
    else columnEnds[col] = item.end
    return { ...item, col }
  })

  const parent = placed.map((_, index) => index)
  function find(index: number): number {
    let current = index
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]]
      current = parent[current]
    }
    return current
  }
  function union(a: number, b: number) {
    const pa = find(a)
    const pb = find(b)
    if (pa !== pb) parent[pb] = pa
  }
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      if (placed[i].start < placed[j].end && placed[j].start < placed[i].end) union(i, j)
    }
  }
  const clusterCols = new Map<number, number>()
  placed.forEach((item, index) => {
    const root = find(index)
    clusterCols.set(root, Math.max(clusterCols.get(root) ?? 0, item.col + 1))
  })

  return placed.map((item, index) => ({
    event: item.event,
    top: item.top,
    height: item.height,
    col: item.col,
    cols: clusterCols.get(find(index)) ?? 1,
  }))
}

/**
 * 按可见事件收窗：取最早开始与最晚结束各外扩 1 小时。
 * 没有事件时回落到 8:00–22:00；今天在视野内时保证当前时刻可见。
 */
function computeAutoWindow(events: ScheduleEvent[], nowMinutes: number | null) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const event of events) {
    min = Math.min(min, event.startMinutes)
    max = Math.max(max, event.startMinutes + event.durationMinutes)
  }
  if (!Number.isFinite(min)) {
    min = FALLBACK_WINDOW_START * 60
    max = FALLBACK_WINDOW_END * 60
  }
  if (nowMinutes != null) {
    min = Math.min(min, nowMinutes)
    max = Math.max(max, nowMinutes)
  }

  let start = Math.floor(min / 60) - WINDOW_PAD_HOURS
  let end = Math.ceil(max / 60) + WINDOW_PAD_HOURS
  start = clamp(start, 0, 24 - WINDOW_MIN_SPAN_HOURS)
  end = clamp(end, start + WINDOW_MIN_SPAN_HOURS, 24)
  if (end - start < WINDOW_MIN_SPAN_HOURS) start = Math.max(0, end - WINDOW_MIN_SPAN_HOURS)
  return { startHour: start, endHour: end }
}

export function SchedulePanel({
  tasksOpen,
  onToggleTasks,
}: {
  tasksOpen?: boolean
  onToggleTasks?: () => void
} = {}) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [dayOffset, setDayOffset] = useState(0)
  const [layoutMode, setLayoutMode] = useState<'day' | 'week'>(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches ? 'day' : 'week'
  ))
  const [draft, setDraft] = useState<DraftEvent | null>(null)
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(() => new Set())
  const [drag, setDrag] = useState<DragState | null>(null)
  const [bodyHeight, setBodyHeight] = useState(0)
  const [bodyWidth, setBodyWidth] = useState(0)
  const [timeColWidth, setTimeColWidth] = useState(0)
  // 本文件的文案统一走模块级 t()；locale 只用来触发重渲染并让相关 memo 失效。
  const { locale } = useI18n()

  const bodyRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const timeColRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null)
  const didScrollRef = useRef(false)

  const {
    showWeekend,
    toggleWeekend,
    setShowWeekend,
    setViewMode,
    scheduleFullDay,
    toggleScheduleFullDay,
    editMode,
    toggleScheduleEditMode,
  } = useUIStore(useShallow((s) => ({
    showWeekend: s.showWeekend,
    toggleWeekend: s.toggleWeekend,
    setShowWeekend: s.setShowWeekend,
    setViewMode: s.setViewMode,
    scheduleFullDay: s.scheduleFullDay,
    toggleScheduleFullDay: s.toggleScheduleFullDay,
    editMode: s.scheduleEditMode,
    toggleScheduleEditMode: s.toggleScheduleEditMode,
  })))
  const {
    scheduleEvents,
    projects,
    tasks,
    addScheduleBlock,
    addScheduleEvent,
    updateScheduleEvent,
    deleteScheduleEvent,
  } = useAppStore(useShallow((s) => ({
    scheduleEvents: s.scheduleEvents,
    projects: s.projects,
    tasks: s.tasks,
    addScheduleBlock: s.addScheduleBlock,
    addScheduleEvent: s.addScheduleEvent,
    updateScheduleEvent: s.updateScheduleEvent,
    deleteScheduleEvent: s.deleteScheduleEvent,
  })))
  const startTimer = useTimerStore((s) => s.start)
  const todayKey = useCalendarDayKey()

  const weekStart = useMemo(() => {
    const base = getWeekStart(dateKeyToDate(todayKey) ?? undefined)
    base.setDate(base.getDate() + weekOffset * 7)
    return base
  }, [todayKey, weekOffset])

  const selectedDay = useMemo(() => {
    const today = dateKeyToDate(todayKey) ?? new Date()
    return addLocalDays(today, dayOffset)
  }, [todayKey, dayOffset])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    function syncLayout(event: MediaQueryListEvent) {
      setLayoutMode(event.matches ? 'day' : 'week')
    }
    media.addEventListener('change', syncLayout)
    return () => media.removeEventListener('change', syncLayout)
  }, [])

  /** 日视图与周视图共用同一套网格，只是列数不同。 */
  const columnDates = useMemo(() => {
    if (layoutMode === 'day') return [selectedDay]
    const count = showWeekend ? 7 : 5
    return Array.from({ length: count }, (_, i) => {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + i)
      return date
    })
  }, [layoutMode, selectedDay, showWeekend, weekStart])
  const columnCount = columnDates.length

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])

  /** 收窗口径用未过滤的事件，避免切换图例筛选时时间轴跳动。 */
  const eventsByColumn = useMemo(() => {
    const grouped = new Map<string, ScheduleEvent[]>()
    for (const date of columnDates) {
      const dateKey = toDateKey(date)
      grouped.set(dateKey, scheduleEvents.filter((event) => eventOccursOnDate(event, dateKey)))
    }
    return grouped
  }, [columnDates, scheduleEvents])

  const visibleEvents = useMemo(() => {
    const all: ScheduleEvent[] = []
    for (const events of eventsByColumn.values()) all.push(...events)
    return all
  }, [eventsByColumn])

  const nowDate = useMinuteClock()
  const showsToday = useMemo(
    () => columnDates.some((date) => toDateKey(date) === todayKey),
    [columnDates, todayKey],
  )
  const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes()

  const { startHour, endHour } = useMemo(() => {
    if (scheduleFullDay) return { startHour: 0, endHour: 24 }
    return computeAutoWindow(visibleEvents, showsToday ? nowMinutes : null)
  }, [scheduleFullDay, visibleEvents, showsToday, nowMinutes])
  const hourCount = endHour - startHour
  const windowStartMinutes = startHour * 60
  const windowEndMinutes = endHour * 60

  const headerHeight = headerHeightFor(layoutMode, bodyWidth)

  /** 窗口短时向上摊满可视高，长到摊不下就滚——可读性优先于「不滚动」。 */
  const hourHeight = useMemo(() => {
    if (bodyHeight <= 0) return FALLBACK_HOUR_HEIGHT
    const usable = bodyHeight - headerHeight
    return clamp(Math.floor(usable / hourCount), MIN_HOUR_HEIGHT, MAX_HOUR_HEIGHT)
  }, [bodyHeight, headerHeight, hourCount])

  useLayoutEffect(() => {
    const node = bodyRef.current
    if (!node) return
    const measure = (height: number, width: number) => {
      setBodyHeight(height)
      setBodyWidth(width)
      setTimeColWidth(timeColRef.current?.getBoundingClientRect().width ?? 0)
    }
    measure(node.clientHeight, node.clientWidth)
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) measure(entry.contentRect.height, entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const gridHeight = headerHeight + hourCount * hourHeight
  const needsScroll = bodyHeight > 0 && gridHeight > bodyHeight

  /** 卡片挤成一行时，列宽决定「起止时间」还是「只写开始」——七列窄屏放不下整段区间。 */
  const dayColumnWidth = bodyWidth > 0 && columnCount > 0
    ? (bodyWidth - timeColWidth) / columnCount
    : 0

  /** 只在真的放不下时才滚到当前时刻，放得下就别乱动视口。 */
  useEffect(() => {
    if (!needsScroll || !showsToday) return
    if (didScrollRef.current) return
    const node = bodyRef.current
    if (!node) return
    const clamped = clamp(nowMinutes, windowStartMinutes, windowEndMinutes)
    const top = headerHeight + ((clamped - windowStartMinutes) / 60) * hourHeight
    node.scrollTo({ top: Math.max(0, top - node.clientHeight * 0.35), behavior: 'smooth' })
    didScrollRef.current = true
  }, [needsScroll, showsToday, nowMinutes, windowStartMinutes, windowEndMinutes, headerHeight, hourHeight])

  useEffect(() => {
    didScrollRef.current = false
  }, [weekOffset, dayOffset, layoutMode, scheduleFullDay])

  const weekRangeLabel = useMemo(() => {
    const end = columnDates[columnDates.length - 1] ?? weekStart
    const start = columnDates[0] ?? weekStart
    return t('schedule.range.week', {
      startMonth: start.getMonth() + 1,
      startDay: start.getDate(),
      endMonth: end.getMonth() + 1,
      endDay: end.getDate(),
    })
    // t() 是模块级的，locale 不出现在闭包里，但语言一变这行文案必须重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnDates, locale, weekStart])

  const legendProjects = useMemo(() => {
    const ids = new Set<string>()
    for (const event of visibleEvents) ids.add(event.projectId)
    return projects.filter((project) => ids.has(project.id))
  }, [projects, visibleEvents])

  const toggleProjectFilter = useCallback((projectId: string) => {
    setHiddenProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  const handleStartTimer = useCallback((taskId: string) => {
    startTimer(taskId)
    setViewMode('timer')
  }, [setViewMode, startTimer])

  const openDraftForRange = useCallback((date: Date, start: number, end: number) => {
    setDraft({
      id: null,
      title: '',
      projectId: projects[0]?.id ?? 'work',
      date: toDateKey(date),
      start,
      end: Math.max(start + SNAP, end),
      repeat: false,
      createTask: true,
    })
  }, [projects])

  const openDraftForEvent = useCallback((event: ScheduleEvent) => {
    setDraft({
      id: event.id,
      title: event.title,
      projectId: event.projectId,
      date: event.date,
      start: event.startMinutes,
      end: event.startMinutes + event.durationMinutes,
      repeat: event.repeat === 'weekly',
      createTask: Boolean(event.taskId),
    })
  }, [])

  /** 屏幕坐标 → （第几列, 吸附到 15 分钟的时刻）。 */
  const pointToSlot = useCallback((clientX: number, clientY: number) => {
    const grid = gridRef.current
    if (!grid) return null
    const rect = grid.getBoundingClientRect()
    const timeWidth = timeColRef.current?.getBoundingClientRect().width ?? 64
    const colWidth = Math.max(1, (rect.width - timeWidth) / columnCount)
    const col = clamp(Math.floor((clientX - rect.left - timeWidth) / colWidth), 0, columnCount - 1)
    const raw = windowStartMinutes + ((clientY - rect.top - headerHeight) / hourHeight) * 60
    const minutes = clamp(snapMinutes(raw), windowStartMinutes, windowEndMinutes)
    return { col, minutes }
  }, [columnCount, headerHeight, hourHeight, windowEndMinutes, windowStartMinutes])

  const beginDrag = useCallback((state: DragState, clientX: number, clientY: number) => {
    dragRef.current = state
    dragOriginRef.current = { x: clientX, y: clientY }
    setDrag(state)
  }, [])

  /**
   * 拖拽期间的依赖走 ref 快照：window 监听器只在拖拽起止各挂/摘一次，
   * 不会因为每次 pointermove 触发 setState 就把监听器重挂一遍。
   */
  const dragDeps = useRef({
    columnDates,
    pointToSlot,
    scheduleEvents,
    updateScheduleEvent,
    openDraftForEvent,
    openDraftForRange,
    windowStartMinutes,
    windowEndMinutes,
  })
  dragDeps.current = {
    columnDates,
    pointToSlot,
    scheduleEvents,
    updateScheduleEvent,
    openDraftForEvent,
    openDraftForRange,
    windowStartMinutes,
    windowEndMinutes,
  }

  const isDragging = drag !== null

  useEffect(() => {
    if (!isDragging) return

    function handleMove(nativeEvent: globalThis.PointerEvent) {
      const deps = dragDeps.current
      const state = dragRef.current
      const origin = dragOriginRef.current
      if (!state || !origin) return
      const slot = deps.pointToSlot(nativeEvent.clientX, nativeEvent.clientY)
      if (!slot) return
      const moved = state.moved
        || Math.abs(nativeEvent.clientX - origin.x) > CLICK_SLOP_PX
        || Math.abs(nativeEvent.clientY - origin.y) > CLICK_SLOP_PX

      let next: DragState
      if (state.kind === 'create') {
        next = { ...state, col: slot.col, current: slot.minutes, moved }
      } else if (state.kind === 'move') {
        const start = clamp(
          snapMinutes(slot.minutes - state.grabOffset),
          deps.windowStartMinutes,
          deps.windowEndMinutes - state.duration,
        )
        next = { ...state, col: slot.col, start, moved }
      } else {
        next = { ...state, end: Math.max(state.start + SNAP, slot.minutes), moved }
      }
      dragRef.current = next
      setDrag(next)
    }

    function handleUp() {
      const deps = dragDeps.current
      const state = dragRef.current
      dragRef.current = null
      dragOriginRef.current = null
      setDrag(null)
      if (!state) return

      const date = deps.columnDates[state.col] ?? deps.columnDates[0]
      if (!date) return

      if (state.kind === 'create') {
        const start = Math.min(state.anchor, state.current)
        const end = Math.max(state.anchor, state.current)
        if (!state.moved) deps.openDraftForRange(date, start, Math.min(deps.windowEndMinutes, start + 60))
        else deps.openDraftForRange(date, start, end)
        return
      }

      const event = deps.scheduleEvents.find((item) => item.id === state.eventId)
      if (!event) return

      if (!state.moved) {
        deps.openDraftForEvent(event)
        return
      }

      if (state.kind === 'move') {
        const dateKey = toDateKey(date)
        const patch: Partial<ScheduleEvent> = {
          startMinutes: state.start,
          dayIndex: getDayIndexFromDate(date),
        }
        // 周期事件挪的是整个系列：只改星期几，除非拖到了系列起点之前。
        if (event.repeat === 'weekly') {
          if (dateKey < event.date) patch.date = dateKey
        } else {
          patch.date = dateKey
        }
        deps.updateScheduleEvent(event.id, patch)
        return
      }

      deps.updateScheduleEvent(event.id, { durationMinutes: Math.max(SNAP, state.end - state.start) })
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [isDragging])

  /**
   * 触屏不走拖拽：pointerdown 里的 preventDefault 会把整个日程区的滚动吃掉。
   * 改成记下落点，抬起时若几乎没位移就当成一次轻点。
   */
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const isTouchTap = (nativeEvent: ReactPointerEvent<HTMLElement>) => {
    const origin = touchStartRef.current
    touchStartRef.current = null
    if (nativeEvent.pointerType !== 'touch' || !origin) return false
    return Math.abs(nativeEvent.clientX - origin.x) < TOUCH_SLOP_PX
      && Math.abs(nativeEvent.clientY - origin.y) < TOUCH_SLOP_PX
  }

  // 空白格建事件只在编辑模式下生效：浏览时误触一下就弹新建弹窗太打扰
  const handleGridPointerDown = useCallback((colIndex: number, nativeEvent: ReactPointerEvent<HTMLDivElement>) => {
    if (!editMode) return
    if (nativeEvent.button !== 0) return
    if (nativeEvent.pointerType === 'touch') {
      touchStartRef.current = { x: nativeEvent.clientX, y: nativeEvent.clientY }
      return
    }
    const slot = pointToSlot(nativeEvent.clientX, nativeEvent.clientY)
    if (!slot) return
    nativeEvent.preventDefault()
    beginDrag({ kind: 'create', col: colIndex, anchor: slot.minutes, current: slot.minutes, moved: false }, nativeEvent.clientX, nativeEvent.clientY)
  }, [beginDrag, editMode, pointToSlot])

  const handleGridPointerUp = useCallback((colIndex: number, nativeEvent: ReactPointerEvent<HTMLDivElement>) => {
    if (!editMode) return
    if (!isTouchTap(nativeEvent)) return
    const slot = pointToSlot(nativeEvent.clientX, nativeEvent.clientY)
    const date = columnDates[colIndex]
    if (!slot || !date) return
    openDraftForRange(date, slot.minutes, Math.min(windowEndMinutes, slot.minutes + 60))
  }, [columnDates, editMode, openDraftForRange, pointToSlot, windowEndMinutes])

  const handleEventPointerUp = useCallback((event: ScheduleEvent, nativeEvent: ReactPointerEvent<HTMLElement>) => {
    if (!isTouchTap(nativeEvent)) return
    nativeEvent.stopPropagation()
    openDraftForEvent(event)
  }, [openDraftForEvent])

  // 浏览模式下事件卡不可拖不可拉，但仍能点开看详情——那是明确针对某个事件的动作
  const handleEventClick = useCallback((event: ScheduleEvent) => {
    openDraftForEvent(event)
  }, [openDraftForEvent])

  const handleEventPointerDown = useCallback((
    event: ScheduleEvent,
    colIndex: number,
    mode: 'move' | 'resize',
    nativeEvent: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!editMode) return
    if (nativeEvent.button !== 0) return
    if (nativeEvent.pointerType === 'touch') {
      touchStartRef.current = { x: nativeEvent.clientX, y: nativeEvent.clientY }
      return
    }
    const slot = pointToSlot(nativeEvent.clientX, nativeEvent.clientY)
    if (!slot) return
    nativeEvent.preventDefault()
    nativeEvent.stopPropagation()
    if (mode === 'move') {
      beginDrag({
        kind: 'move',
        eventId: event.id,
        col: colIndex,
        start: event.startMinutes,
        duration: event.durationMinutes,
        grabOffset: slot.minutes - event.startMinutes,
        moved: false,
      }, nativeEvent.clientX, nativeEvent.clientY)
    } else {
      beginDrag({
        kind: 'resize',
        eventId: event.id,
        col: colIndex,
        start: event.startMinutes,
        end: event.startMinutes + event.durationMinutes,
        moved: false,
      }, nativeEvent.clientX, nativeEvent.clientY)
    }
  }, [beginDrag, editMode, pointToSlot])

  const revealDate = useCallback((dateKey: string) => {
    const date = dateKeyToDate(dateKey)
    if (!date) return
    if (getDayIndexFromDate(date) >= 5) setShowWeekend(true)
    const currentWeek = getWeekStart()
    const eventWeek = getWeekStart(date)
    setWeekOffset(Math.round((eventWeek.getTime() - currentWeek.getTime()) / 604800000))
    const today = dateKeyToDate(todayKey) ?? new Date()
    setDayOffset(Math.round((date.getTime() - today.getTime()) / 86400000))
  }, [setShowWeekend, todayKey])

  const handleSubmitDraft = useCallback((value: DraftEvent) => {
    const title = value.title.trim()
    if (!title) return
    const duration = Math.max(SNAP, value.end - value.start)
    const date = dateKeyToDate(value.date) ?? new Date()

    if (value.id) {
      updateScheduleEvent(value.id, {
        title,
        projectId: value.projectId,
        date: value.date,
        dayIndex: getDayIndexFromDate(date),
        startMinutes: value.start,
        durationMinutes: duration,
        repeat: value.repeat ? 'weekly' : 'none',
      })
    } else if (value.createTask) {
      addScheduleBlock({
        title,
        projectId: value.projectId,
        date: value.date,
        startMinutes: value.start,
        durationMinutes: duration,
        repeat: value.repeat ? 'weekly' : 'none',
      })
    } else {
      addScheduleEvent({
        title,
        projectId: value.projectId,
        date: value.date,
        dayIndex: getDayIndexFromDate(date),
        startMinutes: value.start,
        durationMinutes: duration,
        type: 'fixed',
        repeat: value.repeat ? 'weekly' : 'none',
      })
    }
    revealDate(value.date)
    setDraft(null)
  }, [addScheduleBlock, addScheduleEvent, revealDate, updateScheduleEvent])

  const handleDeleteDraft = useCallback((id: string) => {
    deleteScheduleEvent(id)
    setDraft(null)
  }, [deleteScheduleEvent])

  const goPrev = useCallback(() => {
    if (layoutMode === 'day') setDayOffset((value) => value - 1)
    else setWeekOffset((value) => value - 1)
  }, [layoutMode])
  const goNext = useCallback(() => {
    if (layoutMode === 'day') setDayOffset((value) => value + 1)
    else setWeekOffset((value) => value + 1)
  }, [layoutMode])
  const isAtToday = layoutMode === 'day' ? dayOffset === 0 : weekOffset === 0

  const selectedWeekdayName = weekDays()[getDayIndexFromDate(selectedDay)]
  const headingLabel = layoutMode === 'day'
    ? (dayOffset === 0
        ? t('schedule.title.today')
        : t('schedule.date.monthDay', { month: selectedDay.getMonth() + 1, day: selectedDay.getDate() }))
    : (weekOffset === 0 ? t('schedule.title.thisWeek') : weekRangeLabel)
  // 副标题只补主标题没说的：主标题一旦已经是日期或区间，再抄一遍就成了重复信息
  const subLabel = layoutMode === 'day'
    ? (dayOffset === 0
        ? `${selectedWeekdayName} · ${t('schedule.date.full', {
          year: selectedDay.getFullYear(),
          month: selectedDay.getMonth() + 1,
          day: selectedDay.getDate(),
        })}`
        : `${selectedWeekdayName} · ${relativeOffsetLabel(dayOffset, 'day')}`)
    : (weekOffset === 0 ? weekRangeLabel : relativeOffsetLabel(weekOffset, 'week'))

  /** 「添加」按钮落在今天的下一个整点半点上；今天不在视野里就落在第一列 9:00。 */
  const openDraftAtDefault = useCallback(() => {
    const todayIndex = columnDates.findIndex((date) => toDateKey(date) === todayKey)
    if (todayIndex < 0) {
      openDraftForRange(columnDates[0] ?? selectedDay, 9 * 60, 10 * 60)
      return
    }
    const start = clamp(Math.ceil(nowMinutes / 30) * 30, windowStartMinutes, Math.max(0, windowEndMinutes - 60))
    openDraftForRange(columnDates[todayIndex], start, start + 60)
  }, [columnDates, nowMinutes, openDraftForRange, selectedDay, todayKey, windowEndMinutes, windowStartMinutes])

  const dragPreview = useMemo(() => {
    if (!drag || !drag.moved) return null
    if (drag.kind === 'create') {
      const start = Math.min(drag.anchor, drag.current)
      const end = Math.max(drag.anchor, drag.current)
      if (end - start < SNAP) return null
      return { col: drag.col, start, end }
    }
    if (drag.kind === 'move') return { col: drag.col, start: drag.start, end: drag.start + drag.duration }
    return { col: drag.col, start: drag.start, end: drag.end }
  }, [drag])

  return (
    <div className="schedule-panel">
      <div className="card-header schedule-header">
        <div className="schedule-title-nav">
          <div className="card-header-copy">
            <div className="schedule-heading-row">
              <span className="card-title">{headingLabel}</span>
              <span className="schedule-subrange">{subLabel}</span>
            </div>
            {legendProjects.length > 0 && (
              <div className="schedule-legend" role="group" aria-label={t('a11y.scheduleFilter')}>
                {legendProjects.map((project) => {
                  const hidden = hiddenProjects.has(project.id)
                  return (
                    <button
                      key={project.id}
                      type="button"
                      className={`schedule-legend-item ${hidden ? 'muted' : ''}`}
                      style={{ ['--event-accent']: project.color } as CSSProperties}
                      aria-pressed={!hidden}
                      title={hidden
                        ? t('schedule.legend.show', { name: project.name })
                        : t('schedule.legend.hide', { name: project.name })}
                      onClick={() => toggleProjectFilter(project.id)}
                    >
                      {project.name}
                    </button>
                  )
                })}
                {hiddenProjects.size > 0 && (
                  <button type="button" className="schedule-legend-reset" onClick={() => setHiddenProjects(new Set())}>
                    {t('schedule.legend.showAll')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="schedule-header-actions">
          <div className="schedule-week-nav" role="group" aria-label={layoutMode === 'day' ? t('a11y.dayNav') : t('a11y.weekNav')}>
            <button className="icon-btn" onClick={goPrev} aria-label={layoutMode === 'day' ? t('schedule.nav.prevDay') : t('schedule.nav.prevWeek')}>
              <ChevronLeft size={20} />
            </button>
            <button className="icon-btn" onClick={goNext} aria-label={layoutMode === 'day' ? t('schedule.nav.nextDay') : t('schedule.nav.nextWeek')}>
              <ChevronRight size={20} />
            </button>
          </div>
          {!isAtToday && (
            <button className="ghost-btn" onClick={() => { setDayOffset(0); setWeekOffset(0) }}>{t('common.today')}</button>
          )}
          <div className="schedule-layout-toggle" role="group" aria-label={t('a11y.scheduleView')}>
            <button type="button" className={layoutMode === 'day' ? 'active' : ''} onClick={() => setLayoutMode('day')}>{t('schedule.view.day')}</button>
            <button type="button" className={layoutMode === 'week' ? 'active' : ''} onClick={() => setLayoutMode('week')}>{t('schedule.view.week')}</button>
          </div>
          {/* 次要开关收进一组，和主操作「添加」用分隔线拉开层级 */}
          <div className="schedule-tool-group" role="group" aria-label={t('a11y.displayOptions')}>
            <button
              className={`icon-btn schedule-edit-toggle ${editMode ? 'active' : ''}`}
              title={editMode ? t('schedule.editMode.exit') : t('schedule.editMode.enter')}
              aria-pressed={editMode}
              onClick={toggleScheduleEditMode}
            >
              {editMode ? <PencilOff size={18} /> : <Pencil size={18} />}
            </button>
            <button
              className={`icon-btn weekend-toggle ${scheduleFullDay ? 'active' : ''}`}
              title={scheduleFullDay ? t('schedule.fullDay.collapse') : t('schedule.fullDay.expand')}
              aria-pressed={scheduleFullDay}
              onClick={toggleScheduleFullDay}
            >
              {scheduleFullDay ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            {layoutMode === 'week' && (
              <button
                className={`icon-btn weekend-toggle ${showWeekend ? 'active' : ''}`}
                title={showWeekend ? t('schedule.weekend.hide') : t('schedule.weekend.show')}
                aria-pressed={showWeekend}
                onClick={toggleWeekend}
              >
                <CalendarDays size={18} />
              </button>
            )}
            {onToggleTasks && (
              <button
                type="button"
                className={`icon-btn schedule-tasks-btn ${tasksOpen ? 'active' : ''}`}
                title={tasksOpen ? t('schedule.tasks.collapse') : t('schedule.tasks.expand')}
                aria-pressed={tasksOpen}
                aria-controls="schedule-tasks-drawer"
                onClick={onToggleTasks}
              >
                <ListTodo size={18} />
              </button>
            )}
          </div>
          {/* 手机上只留图标（文字由 CSS 收起），所以 aria-label 必须常在 */}
          <button
            type="button"
            className="primary-btn schedule-add-btn"
            aria-label={t('schedule.addEvent')}
            onClick={openDraftAtDefault}
          >
            <Plus size={16} />
            <span className="schedule-add-label">{t('schedule.add')}</span>
          </button>
        </div>
      </div>

      <div className="schedule-body" ref={bodyRef}>
        <div
          ref={gridRef}
          className={`schedule-grid ${drag ? 'dragging' : ''}${headerHeight === 0 ? ' headless' : ''}`}
          style={{
            height: gridHeight,
            gridTemplateColumns: `var(--time-col-width) repeat(${columnCount}, minmax(0, 1fr))`,
            ['--hour-height']: `${hourHeight}px`,
            ['--header-height']: `${headerHeight}px`,
          } as CSSProperties}
        >
          <div className="schedule-time-column" ref={timeColRef}>
            <div className="schedule-time-spacer" aria-hidden="true" />
            {Array.from({ length: hourCount }, (_, i) => startHour + i).map((hour, index) => (
              // 首个标签不上移，否则会被 sticky 表头盖住——上移是为了让标签骑在网格线上
              <div key={hour} className={`schedule-time-cell ${index === 0 ? 'first' : ''}`}>
                <span className="tabular">{`${String(hour).padStart(2, '0')}:00`}</span>
              </div>
            ))}
          </div>

          {columnDates.map((date, colIndex) => {
            const dateKey = toDateKey(date)
            const all = eventsByColumn.get(dateKey) ?? EMPTY_EVENTS
            const shown = hiddenProjects.size === 0
              ? all
              : all.filter((event) => !hiddenProjects.has(event.projectId))
            return (
              <DayColumn
                key={dateKey}
                colIndex={colIndex}
                date={date}
                isToday={dateKey === todayKey}
                events={shown}
                projectById={projectById}
                taskById={taskById}
                startHour={startHour}
                endHour={endHour}
                hourHeight={hourHeight}
                columnWidth={dayColumnWidth}
                draggingEventId={drag && drag.kind !== 'create' && drag.moved ? drag.eventId : null}
                preview={dragPreview && dragPreview.col === colIndex ? dragPreview : null}
                editMode={editMode}
                onPointerDown={handleGridPointerDown}
                onPointerUp={handleGridPointerUp}
                onEventPointerDown={handleEventPointerDown}
                onEventPointerUp={handleEventPointerUp}
                onEventClick={handleEventClick}
                onStartTimer={handleStartTimer}
                onDelete={deleteScheduleEvent}
              />
            )
          })}

          {showsToday && (
            <CurrentTimeLine
              startHour={startHour}
              endHour={endHour}
              hourHeight={hourHeight}
              headerHeight={headerHeight}
              columnCount={columnCount}
              todayColumn={columnDates.findIndex((date) => toDateKey(date) === todayKey)}
            />
          )}
        </div>
      </div>

      {draft && (
        <EventDialog
          value={draft}
          projects={projects}
          onChange={setDraft}
          onSubmit={handleSubmitDraft}
          onDelete={handleDeleteDraft}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  )
}

function DayColumn({
  colIndex,
  date,
  isToday,
  events,
  projectById,
  taskById,
  startHour,
  endHour,
  hourHeight,
  columnWidth,
  draggingEventId,
  preview,
  editMode,
  onPointerDown,
  onPointerUp,
  onEventPointerDown,
  onEventPointerUp,
  onEventClick,
  onStartTimer,
  onDelete,
}: {
  colIndex: number
  date: Date
  isToday: boolean
  events: ScheduleEvent[]
  projectById: Map<string, Project>
  taskById: Map<string, Task>
  startHour: number
  endHour: number
  hourHeight: number
  columnWidth: number
  draggingEventId: string | null
  preview: { col: number; start: number; end: number } | null
  editMode: boolean
  onPointerDown: (colIndex: number, event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp: (colIndex: number, event: ReactPointerEvent<HTMLDivElement>) => void
  onEventPointerDown: (event: ScheduleEvent, colIndex: number, mode: 'move' | 'resize', native: ReactPointerEvent<HTMLElement>) => void
  onEventPointerUp: (event: ScheduleEvent, native: ReactPointerEvent<HTMLElement>) => void
  onEventClick: (event: ScheduleEvent) => void
  onStartTimer: (taskId: string) => void
  onDelete: (eventId: string) => void
}) {
  const hourCount = endHour - startHour
  const laidOut = useMemo(
    () => layoutDayEvents(events, startHour, endHour, hourHeight),
    [endHour, events, hourHeight, startHour],
  )
  const windowStart = startHour * 60
  const weekday = getDayIndexFromDate(date)
  const isWeekend = weekday === 5 || weekday === 6
  // 手机七列时每列只有 49px，「周一」+ 日期圆点并排要 62px，会把星期挤成竖排两行。
  // 这时星期只留末字、列头改竖排。
  const compactHead = columnWidth > 0 && columnWidth < COMPACT_COLUMN_WIDTH

  return (
    <div className={`schedule-day-column${isToday ? ' today' : ''}${isWeekend ? ' weekend' : ''}`}>
      <div className={`schedule-day-header${compactHead ? ' compact' : ''}`}>
        <div className="schedule-day-name">{compactHead ? weekDaysShort()[weekday] : weekDays()[weekday]}</div>
        <div className={`schedule-day-date${isToday ? ' today' : ''}`}>{date.getDate()}</div>
      </div>

      <div
        className={`schedule-day-cells${editMode ? ' editable' : ''}`}
        onPointerDown={(nativeEvent) => onPointerDown(colIndex, nativeEvent)}
        onPointerUp={(nativeEvent) => onPointerUp(colIndex, nativeEvent)}
      >
        {Array.from({ length: hourCount }, (_, i) => startHour + i).map((hour) => (
          <div key={hour} className="schedule-hour-cell" aria-hidden="true" />
        ))}

        {preview && (
          <div
            className="schedule-drag-preview"
            style={{
              top: ((preview.start - windowStart) / 60) * hourHeight,
              height: Math.max(2, ((preview.end - preview.start) / 60) * hourHeight),
            }}
          >
            <span className="tabular">
              {minutesToTimeLabel(preview.start)} – {minutesToTimeLabel(preview.end)}
            </span>
          </div>
        )}

        {laidOut.map((item) => (
          <EventBlock
            key={item.event.id}
            event={item.event}
            colIndex={colIndex}
            project={projectById.get(item.event.projectId)}
            task={item.event.taskId ? taskById.get(item.event.taskId) ?? null : null}
            top={item.top}
            height={item.height}
            col={item.col}
            cols={item.cols}
            slotWidth={columnWidth > 0 ? columnWidth / item.cols : 0}
            ghosted={draggingEventId === item.event.id}
            editMode={editMode}
            onPointerDown={onEventPointerDown}
            onPointerUp={onEventPointerUp}
            onClick={onEventClick}
            onStartTimer={onStartTimer}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

function CurrentTimeLine({
  startHour,
  endHour,
  hourHeight,
  headerHeight,
  columnCount,
  todayColumn,
}: {
  startHour: number
  endHour: number
  hourHeight: number
  headerHeight: number
  columnCount: number
  todayColumn: number
}) {
  const now = useMinuteClock()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const windowStart = startHour * 60
  if (minutes < windowStart || minutes >= endHour * 60) return null

  const top = headerHeight + ((minutes - windowStart) / 60) * hourHeight

  return (
    <div className="current-time-line" style={{ top }}>
      <div className="current-time-bar" />
      {todayColumn >= 0 && (
        <div className="current-time-dot" style={{ left: `${(todayColumn / columnCount) * 100}%` }} />
      )}
    </div>
  )
}

function EventBlock({
  event,
  colIndex,
  project,
  task,
  top,
  height,
  col,
  cols,
  slotWidth,
  ghosted,
  editMode,
  onPointerDown,
  onPointerUp,
  onClick,
  onStartTimer,
  onDelete,
}: {
  event: ScheduleEvent
  colIndex: number
  project?: Project
  task: Task | null
  top: number
  height: number
  col: number
  cols: number
  slotWidth: number
  ghosted: boolean
  editMode: boolean
  onPointerDown: (event: ScheduleEvent, colIndex: number, mode: 'move' | 'resize', native: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ScheduleEvent, native: ReactPointerEvent<HTMLElement>) => void
  onClick: (event: ScheduleEvent) => void
  onStartTimer: (taskId: string) => void
  onDelete: (eventId: string) => void
}) {
  const isCompleted = task?.status === 'completed'
  const isWeekly = event.repeat === 'weekly'
  const color = project?.color || FALLBACK_EVENT_COLOR
  const compact = height < 52
  // 行高下限 72 之后半小时落在 36px，只进 compact；dense / tiny 留给 15 分钟这类碎片
  const dense = height < 34
  const tiny = height < 22
  const narrow = slotWidth > 0 && slotWidth < NARROW_SLOT_WIDTH
  const sliver = slotWidth > 0 && slotWidth < SLIVER_SLOT_WIDTH
  // 列窄时只写开始时间：结束时间由卡片下沿表达，把区间从中间切断才是真丢信息
  const rangeMinWidth = compact ? COMPACT_RANGE_MIN_WIDTH : STACKED_RANGE_MIN_WIDTH
  const showEndTime = slotWidth === 0 || slotWidth >= rangeMinWidth
  const gaps = (cols - 1) * EVENT_GAP_PX
  const width = `calc((100% - ${EVENT_GUTTER_PX * 2}px - ${gaps}px) / ${cols})`
  const left = `calc(${EVENT_GUTTER_PX}px + (${width} + ${EVENT_GAP_PX}px) * ${col})`

  return (
    <div
      className={`schedule-event ${event.type} ${isCompleted ? 'completed' : ''} ${isWeekly ? 'weekly' : 'once'} ${compact ? 'compact' : ''} ${dense ? 'dense' : ''} ${tiny ? 'tiny' : ''} ${narrow ? 'narrow' : ''} ${sliver ? 'sliver' : ''} ${ghosted ? 'ghosted' : ''}${editMode ? ' editable' : ''}`}
      style={{ top, height, left, width, ['--event-accent']: color } as CSSProperties}
      onPointerDown={(nativeEvent) => onPointerDown(event, colIndex, 'move', nativeEvent)}
      onPointerUp={(nativeEvent) => onPointerUp(event, nativeEvent)}
      onClick={editMode ? undefined : () => onClick(event)}
      role="button"
      tabIndex={0}
      title={`${event.title} · ${minutesToTimeLabel(event.startMinutes)}–${minutesToTimeLabel(event.startMinutes + event.durationMinutes)}${editMode ? t('schedule.event.hintEdit') : t('schedule.event.hintView')}`}
    >
      <div className="schedule-event-copy">
        <div className="schedule-event-title">{event.title}</div>
        {!tiny && (
          <div className="schedule-event-time tabular">
            {minutesToTimeLabel(event.startMinutes)}
            {showEndTime && (
              <>
                <span>–</span>
                {minutesToTimeLabel(event.startMinutes + event.durationMinutes)}
              </>
            )}
            {isWeekly && <Repeat size={dense ? 11 : 14} className="schedule-event-repeat" />}
          </div>
        )}
      </div>
      <div className="schedule-event-actions">
        {event.taskId && (
          <button
            className="schedule-event-action"
            title={t('schedule.event.startTimer')}
            onPointerDown={(nativeEvent) => nativeEvent.stopPropagation()}
            onClick={(nativeEvent) => {
              nativeEvent.stopPropagation()
              onStartTimer(event.taskId!)
            }}
          >
            <Clock size={14} />
          </button>
        )}
        {/* 删除是破坏性操作，浏览模式下不给悬停即达的入口 */}
        {editMode && (
          <button
            className="schedule-event-action"
            title={t('schedule.event.delete')}
            onPointerDown={(nativeEvent) => nativeEvent.stopPropagation()}
            onClick={(nativeEvent) => {
              nativeEvent.stopPropagation()
              onDelete(event.id)
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {editMode && (
        <div
          className="schedule-event-resize"
          title={t('schedule.event.resize')}
          onPointerDown={(nativeEvent) => onPointerDown(event, colIndex, 'resize', nativeEvent)}
        />
      )}
    </div>
  )
}

function EventDialog({
  value,
  projects,
  onChange,
  onSubmit,
  onDelete,
  onClose,
}: {
  value: DraftEvent
  projects: Project[]
  onChange: (next: DraftEvent) => void
  onSubmit: (value: DraftEvent) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const titleRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef(onClose)
  const { locale } = useI18n()
  closeRef.current = onClose

  // 只在挂载时聚焦一次：跟着 onClose 走会导致每敲一个字就重新全选标题。
  useEffect(() => {
    titleRef.current?.focus()
    titleRef.current?.select()
    return registerOverlay(() => {
      closeRef.current()
      return true
    })
  }, [])

  const durationLabel = useMemo(() => {
    const minutes = Math.max(SNAP, value.end - value.start)
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    if (hours === 0) return t('duration.minutes', { minutes: rest })
    return rest === 0
      ? t('duration.hours', { hours })
      : t('duration.hoursMinutes', { hours, minutes: rest })
    // 同上：t() 是模块级的，locale 只作重算触发器。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, value.end, value.start])

  return (
    <div className="schedule-dialog-backdrop" onPointerDown={onClose}>
      <form
        className="schedule-dialog"
        onPointerDown={(nativeEvent) => nativeEvent.stopPropagation()}
        onSubmit={(nativeEvent) => {
          nativeEvent.preventDefault()
          onSubmit(value)
        }}
      >
        <div className="schedule-dialog-head">
          <div className="schedule-dialog-heading">{value.id ? t('schedule.editEvent') : t('schedule.addEvent')}</div>
          <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <label className="schedule-dialog-title">
          <input
            ref={titleRef}
            type="text"
            placeholder={t('schedule.dialog.title')}
            value={value.title}
            onChange={(nativeEvent) => onChange({ ...value, title: nativeEvent.target.value })}
            aria-label={t('schedule.dialog.title')}
          />
        </label>

        <div className="schedule-dialog-projects" role="group" aria-label={t('schedule.dialog.project')}>
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={`schedule-project-chip ${value.projectId === project.id ? 'active' : ''}`}
              style={{ ['--event-accent']: project.color } as CSSProperties}
              aria-pressed={value.projectId === project.id}
              onClick={() => onChange({ ...value, projectId: project.id })}
            >
              {project.name}
            </button>
          ))}
        </div>

        <div className="schedule-dialog-fields">
          <label>
            <span>{t('schedule.dialog.date')}</span>
            <input
              type="date"
              value={value.date}
              onChange={(nativeEvent) => onChange({ ...value, date: nativeEvent.target.value })}
              aria-label={t('a11y.scheduleDate')}
            />
          </label>
          <label>
            <span>{t('schedule.dialog.start')}</span>
            <input
              type="time"
              step={900}
              value={minutesToTimeInput(value.start)}
              onChange={(nativeEvent) => {
                const start = parseTimeToMinutes(nativeEvent.target.value)
                const span = Math.max(SNAP, value.end - value.start)
                onChange({ ...value, start, end: Math.min(24 * 60, start + span) })
              }}
              aria-label={t('a11y.startTime')}
            />
          </label>
          <label>
            <span>{t('schedule.dialog.end')}</span>
            <input
              type="time"
              step={900}
              value={minutesToTimeInput(Math.min(24 * 60 - 1, value.end))}
              onChange={(nativeEvent) => {
                const end = parseTimeToMinutes(nativeEvent.target.value)
                onChange({ ...value, end: Math.max(value.start + SNAP, end) })
              }}
              aria-label={t('a11y.endTime')}
            />
          </label>
          <div className="schedule-dialog-duration">
            <span>{t('schedule.dialog.duration')}</span>
            <strong className="tabular">{durationLabel}</strong>
          </div>
        </div>

        <div className="schedule-dialog-toggles">
          <label className={`schedule-repeat-toggle ${value.repeat ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={value.repeat}
              onChange={(nativeEvent) => onChange({ ...value, repeat: nativeEvent.target.checked })}
            />
            <Repeat size={16} />
            {t('schedule.dialog.repeatWeekly')}
          </label>
          {!value.id && (
            <label className={`schedule-repeat-toggle ${value.createTask ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={value.createTask}
                onChange={(nativeEvent) => onChange({ ...value, createTask: nativeEvent.target.checked })}
              />
              <ListTodo size={16} />
              {t('schedule.dialog.alsoCreateTask')}
            </label>
          )}
        </div>

        {value.repeat && (
          <p className="schedule-dialog-hint">{t('schedule.dialog.seriesHint')}</p>
        )}

        <div className="schedule-dialog-actions">
          {value.id && (
            <button type="button" className="schedule-dialog-delete" onClick={() => onDelete(value.id!)}>
              <Trash2 size={16} />
              {t('common.delete')}
            </button>
          )}
          <div className="schedule-dialog-actions-right">
            <button type="button" className="ghost-btn" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="primary-btn" disabled={!value.title.trim()}>
              {value.id ? t('common.save') : t('schedule.addEvent')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
