import { useEffect, useState } from 'react'
import { getSyncStatus, runSync, subscribeSyncStatus, type SyncStatus as Status } from '../../lib/sync'
import { useAuthStore } from '../../stores/authStore'
import { useI18n, type MessageKey } from '../../i18n'

const LABEL_KEYS: Record<Status, MessageKey> = {
  idle: 'sync.status.idle',
  syncing: 'sync.status.syncing',
  offline: 'sync.status.offline',
  error: 'sync.status.error',
}

export function SyncStatus() {
  const session = useAuthStore((s) => s.session)
  const { t } = useI18n()
  const [{ status, error }, setState] = useState(getSyncStatus())

  useEffect(() => subscribeSyncStatus((next, nextError) => {
    setState({ status: next, error: nextError ?? null })
  }), [])

  if (!session) {
    return <span className={`sync-dot local`} title={t('sync.status.localTitle')}>{t('sync.status.local')}</span>
  }

  const label = t(LABEL_KEYS[status])
  return (
    <button
      type="button"
      className={`sync-dot ${status}`}
      title={error ?? label}
      onClick={() => {
        void runSync(session)
      }}
    >
      {label}
    </button>
  )
}
