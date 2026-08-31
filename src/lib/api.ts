import { Capacitor } from '@capacitor/core'
import { t } from '../i18n/messages'
import type { SyncCollections } from '../types'

const AUTH_STORAGE_KEY = 'focusdeck-auth'
const SERVER_STORAGE_KEY = 'focusdeck-server'

export interface AuthSession {
  token: string
  expiresAt: number
  username: string
}

export interface SyncResponse {
  since: number
  serverNow: number
  changes: SyncCollections
}

/**
 * 补全用户手填的地址：只写 IP 或域名时按裸 http 处理，端口/路径原样保留。
 * 返回空串表示「同源」，只有网页端能这么用。
 */
export function normalizeServerUrl(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const url = new URL(withScheme)
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return ''
  }
}

export function readServerUrl() {
  try {
    return localStorage.getItem(SERVER_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeServerUrl(value: string) {
  const normalized = normalizeServerUrl(value)
  if (normalized) localStorage.setItem(SERVER_STORAGE_KEY, normalized)
  else localStorage.removeItem(SERVER_STORAGE_KEY)
  return normalized
}

/**
 * 优先级：用户在设置里填的 > 构建期 VITE_API_BASE > 同源。
 * 原生端没有「同源」可言，必须显式配置，否则请求会打到 capacitor://localhost 上。
 */
function apiBase() {
  const saved = readServerUrl()
  if (saved) return saved
  const configured = import.meta.env.VITE_API_BASE
  if (configured) return String(configured).replace(/\/$/, '')
  return ''
}

export function hasServerConfigured() {
  return Boolean(readServerUrl() || import.meta.env.VITE_API_BASE) || !Capacitor.isNativePlatform()
}

export function pingServer(baseUrl: string, timeoutMs = 6000) {
  const base = normalizeServerUrl(baseUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(`${base}/api/health`, { signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      // 反向代理找不到路由时常把 SPA 的 index.html 兜底返回，状态码照样是 200，
      // 直接 json() 只会抛个看不懂的解析错，这里明确指出是地址指错了。
      const text = await response.text()
      let payload: unknown
      try {
        payload = JSON.parse(text)
      } catch {
        throw new Error(t('sync.api.notApi'))
      }
      if (!payload || (payload as { ok?: boolean }).ok !== true) {
        throw new Error(t('sync.api.notFocusDeck'))
      }
      return true
    })
    .finally(() => clearTimeout(timer))
}

export function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as AuthSession
    if (!session.token || !session.expiresAt || session.expiresAt <= Date.now()) return null
    return session
  } catch {
    return null
  }
}

export function writeSession(session: AuthSession | null) {
  if (!session) {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    return
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${apiBase()}${path}`, { ...init, headers })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function fetchServerTime() {
  return request<{ serverNow: number }>('/api/time')
}

export function loginRequest(username: string, password: string) {
  return request<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function fetchMe(token: string) {
  return request<{ username: string }>('/api/auth/me', {}, token)
}

export function pullSync(token: string, since: number) {
  return request<SyncResponse>(`/api/sync?since=${since}`, {}, token)
}

export function pushSync(token: string, since: number, changes: Partial<SyncCollections>) {
  return request<SyncResponse>('/api/sync', {
    method: 'POST',
    body: JSON.stringify({ since, changes }),
  }, token)
}
