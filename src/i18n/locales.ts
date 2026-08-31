/** 语言清单与探测。这是 i18n 的叶子模块，不依赖任何其它文件，供 store 初始化时调用。 */

export const LOCALES = ['zh-CN', 'en'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'zh-CN'

/** 语言切换器上显示的名字：一律用该语言自己的写法，不做翻译。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
}

/** 分段按钮塞不下全名，用一两个字的短写；同样不做翻译。 */
export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  'zh-CN': '中',
  en: 'EN',
}

/** date-fns 与 <html lang> 用的 BCP 47 标记。 */
export const LOCALE_TAGS: Record<Locale, string> = {
  'zh-CN': 'zh-CN',
  en: 'en',
}

/** 长日期的 date-fns pattern：中文「2026年8月31日」，英文「31 Aug 2026」，同一个 pattern 套不出来。 */
export const LOCALE_DATE_PATTERNS: Record<Locale, string> = {
  'zh-CN': 'yyyy年M月d日',
  en: 'd MMM yyyy',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * 首次运行按浏览器语言猜。中文以外一律给英文——这个仓库要放 GitHub，
 * 对非中文访客来说英文比中文更可能读得懂，猜错了顶栏里一键就能改回来。
 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const raw of candidates) {
    const lang = (raw ?? '').toLowerCase()
    if (lang.startsWith('zh')) return 'zh-CN'
    if (lang.startsWith('en')) return 'en'
  }
  return 'en'
}
