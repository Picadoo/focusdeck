/**
 * 翻译内核：只依赖词典和语言清单，**不碰 store**。
 * store 反过来依赖这里（`setActiveLocale`），utils / data / 原生通知这些非 React 模块
 * 也从这里取 `t`，从而绕开 uiStore → utils → i18n → uiStore 的循环引用。
 */
import { enUS, zhCN } from 'date-fns/locale'
import type { Locale as DateFnsLocale } from 'date-fns'
import { DEFAULT_LOCALE, LOCALE_DATE_PATTERNS, type Locale } from './locales'
import { zh, type MessageKey } from './zh'
import { en } from './en'

export type { MessageKey } from './zh'

const DICTS: Record<Locale, Record<MessageKey, string>> = { 'zh-CN': zh, en }

const DATE_LOCALES: Record<Locale, DateFnsLocale> = { 'zh-CN': zhCN, en: enUS }

export type MessageParams = Record<string, string | number>

let activeLocale: Locale = DEFAULT_LOCALE

/** 由 uiStore 在初始化、切换语言、读回存档时调用，保持与 React 树同一个值。 */
export function setActiveLocale(locale: Locale) {
  activeLocale = locale
}

export function currentLocale(): Locale {
  return activeLocale
}

/**
 * 占位符写 {name}。缺参数时原样保留占位符而不是塞 undefined ——
 * 界面上看到 {count} 一眼就知道是漏传，塞 undefined 只会得到一句读不通的话。
 */
function interpolate(template: string, params?: MessageParams) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole)
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams) {
  const dict = DICTS[locale] ?? DICTS[DEFAULT_LOCALE]
  return interpolate(dict[key] ?? zh[key] ?? key, params)
}

/** 模块级直调的翻译函数；React 组件里请用 useI18n() 以便语言切换时重渲染。 */
export function t(key: MessageKey, params?: MessageParams) {
  return translate(activeLocale, key, params)
}

export function dateLocaleOf(locale: Locale) {
  return DATE_LOCALES[locale] ?? DATE_LOCALES[DEFAULT_LOCALE]
}

export function currentDateLocale() {
  return dateLocaleOf(activeLocale)
}

export function currentDatePattern() {
  return LOCALE_DATE_PATTERNS[activeLocale] ?? LOCALE_DATE_PATTERNS[DEFAULT_LOCALE]
}
