import { useCallback, useEffect, useState } from 'react'
import { BellRing, CircleAlert, CircleCheck, CircleHelp, RefreshCw } from 'lucide-react'
import {
  getReminderDiagnostics,
  requestExactReminderSetting,
  requestReminderPermissions,
  sendTestReminder,
  type ReminderDiagnostics,
} from '../../lib/nativeReminders'
import {
  getDeviceGuardStatus,
  openAutoStartSettings,
  openNotificationSettings,
  requestIgnoreBatteryOptimization,
  type DeviceGuardStatus,
} from '../../lib/deviceGuard'
import { useI18n, type MessageKey, type MessageParams } from '../../i18n'

type Translate = (key: MessageKey, params?: MessageParams) => string

type Level = 'ok' | 'warn' | 'bad' | 'unknown'

interface CheckRow {
  key: string
  label: string
  value: string
  level: Level
  hint?: string
  action?: { label: string; run: () => Promise<unknown> }
}

const LEVEL_ICON = {
  ok: CircleCheck,
  warn: CircleAlert,
  bad: CircleAlert,
  unknown: CircleHelp,
} as const

function buildRows(
  diagnostics: ReminderDiagnostics,
  guard: DeviceGuardStatus | null,
  t: Translate,
): CheckRow[] {
  const rows: CheckRow[] = [
    {
      key: 'permission',
      label: t('notify.check.permission'),
      value: diagnostics.permission === 'granted'
        ? t('notify.check.permission.granted')
        : diagnostics.permission === 'denied'
          ? t('notify.check.permission.denied')
          : t('notify.check.permission.unknown'),
      level: diagnostics.permission === 'granted' ? 'ok' : 'bad',
      hint: diagnostics.permission === 'granted' ? undefined : t('notify.check.permission.hint'),
      action: diagnostics.permission === 'granted'
        ? undefined
        : { label: t('notify.check.permission.action'), run: async () => { await requestReminderPermissions() } },
    },
    {
      key: 'exact',
      label: t('notify.check.exact'),
      value: diagnostics.exactAlarm === 'granted'
        ? t('notify.check.exact.granted')
        : diagnostics.exactAlarm === 'denied'
          ? t('notify.check.exact.denied')
          : t('notify.check.exact.unknown'),
      level: diagnostics.exactAlarm === 'granted' ? 'ok' : 'warn',
      hint: diagnostics.exactAlarm === 'granted' ? undefined : t('notify.check.exact.hint'),
      action: diagnostics.exactAlarm === 'granted'
        ? undefined
        : { label: t('notify.check.exact.action'), run: requestExactReminderSetting },
    },
    {
      key: 'pending',
      label: t('notify.check.pending'),
      value: t('notify.check.pending.value', { count: diagnostics.pendingCount }),
      level: diagnostics.pendingCount > 0 ? 'ok' : 'warn',
      hint: diagnostics.pendingCount > 0 ? undefined : t('notify.check.pending.hint'),
    },
  ]

  if (guard) {
    rows.push({
      key: 'battery',
      label: t('notify.check.battery'),
      value: guard.batteryOptimizationIgnored
        ? t('notify.check.battery.allowed')
        : t('notify.check.battery.blocked'),
      level: guard.batteryOptimizationIgnored ? 'ok' : 'bad',
      hint: guard.batteryOptimizationIgnored ? undefined : t('notify.check.battery.hint'),
      action: guard.batteryOptimizationIgnored
        ? undefined
        : { label: t('notify.check.battery.action'), run: requestIgnoreBatteryOptimization },
    })
    if (guard.vendorRestricted) {
      rows.push({
        key: 'autostart',
        label: t('notify.check.autostart', { manufacturer: guard.manufacturer }),
        value: guard.autoStartSettingsAvailable
          ? t('notify.check.autostart.manual')
          : t('notify.check.autostart.missing'),
        level: 'warn',
        hint: t('notify.check.autostart.hint'),
        action: { label: t('notify.check.autostart.action'), run: openAutoStartSettings },
      })
    }
  }

  return rows
}

export function NotificationCheckCard() {
  const { t } = useI18n()
  const [diagnostics, setDiagnostics] = useState<ReminderDiagnostics | null>(null)
  const [guard, setGuard] = useState<DeviceGuardStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const refresh = useCallback(async () => {
    setBusy(true)
    const [next, guardStatus] = await Promise.all([getReminderDiagnostics(), getDeviceGuardStatus()])
    setDiagnostics(next)
    setGuard(guardStatus)
    setBusy(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!diagnostics) return null

  const rows = buildRows(diagnostics, guard, t)
  const blocking = rows.filter((row) => row.level === 'bad').length

  async function runAction(row: CheckRow) {
    if (!row.action) return
    await row.action.run()
    await refresh()
  }

  async function runTest() {
    setToast('')
    const ok = await sendTestReminder()
    setToast(ok ? t('notify.check.testQueued') : t('notify.check.testFailed'))
    await refresh()
  }

  return (
    <section className="notify-check">
      <div className="notify-check-head">
        <div className="notify-check-title">
          <BellRing size={16} />
          {t('notify.check.title')}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => void refresh()}
          disabled={busy}
          aria-label={t('notify.check.refresh')}
        >
          <RefreshCw size={16} className={busy ? 'notify-check-spin' : undefined} />
        </button>
      </div>

      {!diagnostics.native && (
        <p className="notify-check-note">{t('notify.check.webOnly')}</p>
      )}

      <ul className="notify-check-list">
        {rows.map((row) => {
          const Icon = LEVEL_ICON[row.level]
          return (
            <li key={row.key} className={`notify-check-row level-${row.level}`}>
              <span className="notify-check-icon" aria-hidden="true"><Icon size={16} /></span>
              <span className="notify-check-copy">
                <span className="notify-check-label">
                  {row.label}
                  <em>{row.value}</em>
                </span>
                {row.hint && <span className="notify-check-hint">{row.hint}</span>}
              </span>
              {row.action && (
                <button type="button" className="ghost-btn notify-check-action" onClick={() => void runAction(row)}>
                  {row.action.label}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <div className="notify-check-footer">
        <button type="button" className="primary-btn" onClick={() => void runTest()}>
          {t('notify.check.sendTest')}
        </button>
        {diagnostics.native && (
          <button type="button" className="ghost-btn" onClick={() => void openNotificationSettings()}>
            {t('notify.check.systemSettings')}
          </button>
        )}
      </div>

      {toast && <p className="notify-check-toast">{toast}</p>}
      {blocking > 0 && (
        <p className="notify-check-summary">{t('notify.check.blocking', { count: blocking })}</p>
      )}
    </section>
  )
}
