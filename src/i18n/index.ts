import { useUIStore } from '../stores/uiStore'
import { dateLocaleOf, translate, type MessageKey, type MessageParams } from './messages'

export {
  LOCALES,
  LOCALE_LABELS,
  LOCALE_SHORT_LABELS,
  LOCALE_TAGS,
  LOCALE_DATE_PATTERNS,
  DEFAULT_LOCALE,
  detectLocale,
  isLocale,
} from './locales'
export type { Locale } from './locales'

export {
  t,
  translate,
  currentLocale,
  currentDateLocale,
  currentDatePattern,
  dateLocaleOf,
  setActiveLocale,
} from './messages'
export type { MessageKey, MessageParams } from './messages'

export function useLocale() {
  return useUIStore((s) => s.locale)
}

/**
 * 组件里的入口。返回的 t 依赖当前 locale，语言一变整棵树重渲染，
 * 不需要每个组件各自订阅。
 */
export function useI18n() {
  const locale = useUIStore((s) => s.locale)
  const setLocale = useUIStore((s) => s.setLocale)
  return {
    locale,
    setLocale,
    t: (key: MessageKey, params?: MessageParams) => translate(locale, key, params),
    dateLocale: dateLocaleOf(locale),
  }
}
