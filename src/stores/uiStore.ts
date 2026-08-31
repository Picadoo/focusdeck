import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LayoutState, ViewMode } from '../types'
import { clampDayHours } from '../lib/utils'
import { DEFAULT_LOCALE, detectLocale, isLocale, LOCALE_TAGS, type Locale } from '../i18n/locales'
import { setActiveLocale } from '../i18n/messages'

/**
 * 语言一变要同步两处 React 管不到的地方：模块级 `t()` 用的当前语言，
 * 以及 <html lang>（影响浏览器断行、拼写检查和读屏器发音）。
 */
function applyLocale(locale: Locale) {
  setActiveLocale(locale)
  if (typeof document !== 'undefined') document.documentElement.lang = LOCALE_TAGS[locale]
}

const initialLocale = detectLocale()
applyLocale(initialLocale)

interface UIStore extends LayoutState {
  locale: Locale
  soundEnabled: boolean
  overlayEnabled: boolean
  notifyEnabled: boolean
  /** 日程网格是否展开完整 24 小时；关闭时按当周事件自适应收窗。 */
  scheduleFullDay: boolean
  /** 日程编辑模式；默认关闭，避免看日程时误触就弹出新建弹窗。 */
  scheduleEditMode: boolean
  setLocale: (locale: Locale) => void
  setViewMode: (viewMode: ViewMode) => void
  setShowWeekend: (showWeekend: boolean) => void
  toggleWeekend: () => void
  setDayHours: (startHour: number, endHour: number) => void
  setSoundEnabled: (soundEnabled: boolean) => void
  setOverlayEnabled: (overlayEnabled: boolean) => void
  setNotifyEnabled: (notifyEnabled: boolean) => void
  toggleScheduleFullDay: () => void
  toggleScheduleEditMode: () => void
}

export const useUIStore = create(
  persist<UIStore>(
    (set) => ({
      showWeekend: true,
      viewMode: 'tasks',
      locale: initialLocale,
      dayStartHour: 7,
      dayEndHour: 24,
      soundEnabled: true,
      overlayEnabled: true,
      notifyEnabled: true,
      scheduleFullDay: false,
      scheduleEditMode: false,
      setLocale: (locale) => {
        applyLocale(locale)
        set({ locale })
      },
      setViewMode: (viewMode) => set({ viewMode }),
      setShowWeekend: (showWeekend) => set({ showWeekend }),
      toggleWeekend: () => set((s) => ({ showWeekend: !s.showWeekend })),
      setDayHours: (startHour, endHour) => set(clampDayHours(startHour, endHour)),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setOverlayEnabled: (overlayEnabled) => set({ overlayEnabled }),
      setNotifyEnabled: (notifyEnabled) => set({ notifyEnabled }),
      toggleScheduleFullDay: () => set((s) => ({ scheduleFullDay: !s.scheduleFullDay })),
      toggleScheduleEditMode: () => set((s) => ({ scheduleEditMode: !s.scheduleEditMode })),
    }),
    {
      name: 'focusdeck-ui-storage',
      version: 6,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<UIStore>
        const persistedEnd = state.dayEndHour ?? 24
        const hours = clampDayHours(
          state.dayStartHour ?? 7,
          version < 2 ? persistedEnd + 1 : persistedEnd,
        )
        return {
          ...state,
          ...hours,
          // v4 起周末默认可见：旧版按「今天是不是周末」推断，周一打开只有五列。
          showWeekend: version < 4 ? true : state.showWeekend ?? true,
          soundEnabled: state.soundEnabled ?? true,
          overlayEnabled: state.overlayEnabled ?? true,
          notifyEnabled: state.notifyEnabled ?? true,
          scheduleFullDay: state.scheduleFullDay ?? false,
          // v5：编辑模式每次都从关闭起步，不持久化用户上次的开启状态
          scheduleEditMode: false,
          // v6：老用户没存过语言，按浏览器猜一次；猜错顶栏一键能改。
          locale: isLocale(state.locale) ? state.locale : detectLocale(),
        } as UIStore
      },
      partialize: (state) => ({
        locale: state.locale,
        showWeekend: state.showWeekend,
        dayStartHour: state.dayStartHour,
        dayEndHour: state.dayEndHour,
        soundEnabled: state.soundEnabled,
        overlayEnabled: state.overlayEnabled,
        notifyEnabled: state.notifyEnabled,
        scheduleFullDay: state.scheduleFullDay,
      }) as UIStore,
      // 读回存档后才知道最终语言：初始渲染用的是 detectLocale() 的猜测值。
      onRehydrateStorage: () => (state) => {
        applyLocale(state?.locale ?? DEFAULT_LOCALE)
      },
    },
  ),
)
