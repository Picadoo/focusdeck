import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '../../stores/authStore'
import { requestReminderPermissions } from '../../lib/nativeReminders'
import { oemBatteryHint } from '../../lib/nativeApp'
import { normalizeServerUrl, pingServer, readServerUrl, writeServerUrl } from '../../lib/api'
import { useI18n } from '../../i18n'
import './sync.css'

type ProbeState = { kind: 'idle' | 'testing' | 'ok' | 'fail'; message?: string }

export function LoginCard() {
  const session = useAuthStore((s) => s.session)
  const status = useAuthStore((s) => s.status)
  const error = useAuthStore((s) => s.error)
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)
  const { t } = useI18n()
  const [username, setUsername] = useState('focus')
  const [password, setPassword] = useState('')
  const [server, setServer] = useState(readServerUrl)
  const [probe, setProbe] = useState<ProbeState>({ kind: 'idle' })

  // 原生端没有同源可用，地址不填就一定连不上，这里要说明白而不是等登录报错
  const isNative = Capacitor.isNativePlatform()
  const serverMissing = isNative && !normalizeServerUrl(server)

  const testConnection = async () => {
    const target = normalizeServerUrl(server)
    if (!target) {
      setProbe({ kind: 'fail', message: t('sync.login.needServer') })
      return
    }
    setProbe({ kind: 'testing' })
    try {
      await pingServer(target)
      setProbe({ kind: 'ok', message: t('sync.login.reachable', { target }) })
    } catch (err) {
      const reason = err instanceof Error ? err.message : t('sync.login.failed')
      setProbe({ kind: 'fail', message: reason === 'Failed to fetch' ? t('sync.login.unreachable') : reason })
    }
  }

  if (session) {
    const batteryHint = oemBatteryHint()
    return (
      <div className="sync-account">
        <p>{t('sync.account.signedIn', { username: session.username })}</p>
        <p className="sync-login-hint">
          {t('sync.account.server', { server: readServerUrl() || t('sync.account.currentSite') })}
        </p>
        {batteryHint && <p className="sync-login-hint">{batteryHint}</p>}
        <button className="ghost-btn" type="button" onClick={logout}>{t('sync.account.logout')}</button>
      </div>
    )
  }

  return (
    <form
      className="sync-login"
      onSubmit={async (event) => {
        event.preventDefault()
        writeServerUrl(server)
        const ok = await login(username.trim(), password)
        if (ok) void requestReminderPermissions()
      }}
    >
      <div className="sync-login-title">{t('sync.login.title')}</div>
      <div className="sync-server-row">
        {/* 用 text 而非 url：裸写 IP:端口 是最常见的输入，type=url 会被浏览器原生校验拦下 */}
        <input
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={isNative ? t('sync.login.serverNative') : t('sync.login.serverWeb')}
          value={server}
          onChange={(event) => {
            setServer(event.target.value)
            setProbe({ kind: 'idle' })
          }}
          onBlur={() => setServer((value) => normalizeServerUrl(value) || value)}
          aria-label={t('sync.login.serverLabel')}
        />
        <button
          className="ghost-btn sync-test-btn"
          type="button"
          onClick={testConnection}
          disabled={probe.kind === 'testing'}
        >
          {probe.kind === 'testing' ? t('sync.login.testing') : t('sync.login.test')}
        </button>
      </div>
      {probe.message && (
        <p className={probe.kind === 'ok' ? 'sync-login-ok' : 'sync-login-error'}>{probe.message}</p>
      )}
      {serverMissing && !probe.message && (
        <p className="sync-login-hint">{t('sync.login.nativeServerHint')}</p>
      )}
      <input
        type="text"
        autoComplete="username"
        placeholder={t('sync.login.username')}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        aria-label={t('sync.login.username')}
      />
      <input
        type="password"
        autoComplete="current-password"
        placeholder={t('sync.login.password')}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        aria-label={t('sync.login.password')}
      />
      {error && <p className="sync-login-error">{error}</p>}
      <button
        className="primary-btn"
        type="submit"
        disabled={status === 'loading' || !username.trim() || !password || serverMissing}
      >
        {status === 'loading' ? t('sync.login.submitting') : t('sync.login.submit')}
      </button>
      <p className="sync-login-hint">{t('sync.login.localHint')}</p>
    </form>
  )
}
