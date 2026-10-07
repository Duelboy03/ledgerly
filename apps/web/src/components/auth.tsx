import type { SessionUser } from '@ledgerly/api'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useApi } from '../api'

interface AuthCtx {
  user: SessionUser | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}
const Ctx = createContext<AuthCtx | null>(null)
export const useAuth = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>')
  return c
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { api } = useApi()
  const qc = useQueryClient()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api.me().then(setUser, () => setUser(null)).finally(() => setReady(true))
  }, [api])

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await api.login(email, password)
      qc.clear()
      setUser(r.user)
    },
    [api, qc],
  )
  const logout = useCallback(() => {
    api.logout()
    qc.clear()
    setUser(null)
  }, [api, qc])

  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>
}
