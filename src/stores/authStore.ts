import { create } from 'zustand'
import { t } from '../i18n/messages'
import { loginRequest, readSession, writeSession, type AuthSession } from '../lib/api'

interface AuthStore {
  session: AuthSession | null
  status: 'idle' | 'loading' | 'error'
  error: string | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: readSession(),
  status: 'idle',
  error: null,
  login: async (username, password) => {
    set({ status: 'loading', error: null })
    try {
      const session = await loginRequest(username, password)
      writeSession(session)
      set({ session, status: 'idle', error: null })
      return true
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : t('sync.login.error'),
      })
      return false
    }
  },
  logout: () => {
    writeSession(null)
    set({ session: null, status: 'idle', error: null })
  },
}))
