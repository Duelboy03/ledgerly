import type { LedgerlyApi } from '@ledgerly/api'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { HttpApi } from './http'

export type Mode = 'http' | 'demo'
export const MODE: Mode = import.meta.env.VITE_API_MODE === 'local' ? 'demo' : 'http'

interface Ctx {
  api: LedgerlyApi
  mode: Mode
  resetDemo: () => Promise<void>
}
const ApiContext = createContext<Ctx | null>(null)

export const useApi = () => {
  const c = useContext(ApiContext)
  if (!c) throw new Error('useApi must be used inside <ApiProvider>')
  return c
}

/**
 * Demo mode runs the real services against PostgreSQL compiled to WebAssembly (PGlite), in memory,
 * so the hosted demo has no server and no secrets but exercises the same code and SQL as the API.
 * Data is seeded on every load, so a refresh always gives a clean demo.
 */
async function createDemoApi(onStatus: (s: string) => void): Promise<{ api: LedgerlyApi; reset: () => Promise<void> }> {
  onStatus('Loading the database engine')
  const lib = await import('@ledgerly/api')
  const db = await lib.createPgliteDb()
  await lib.migrate(db)
  const services = lib.createServices(db, { jwtSecret: 'demo-only-secret-demo-only-secret-0000', bcryptRounds: 6 })
  onStatus('Creating the demo company, people and payroll history')
  await lib.seedDemo(services, { today: lib.realToday(), withPayrollHistory: true })
  return { api: new lib.LocalApi(services), reset: async () => location.reload() }
}

export function ApiProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [status, setStatus] = useState('Starting')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (MODE === 'http') {
          if (!cancelled) setCtx({ api: new HttpApi(), mode: 'http', resetDemo: async () => {} })
        } else {
          const { api, reset } = await createDemoApi(setStatus)
          if (!cancelled) setCtx({ api, mode: 'demo', resetDemo: reset })
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (error)
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold">The demo database could not start</h1>
          <p className="mt-2 max-w-md text-sm text-sub">{error}</p>
          <p className="mt-2 max-w-md text-sm text-sub">Private browsing modes can block the local storage the demo uses. Try a normal window.</p>
        </div>
      </div>
    )
  if (!ctx)
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-line border-t-brand" role="status" aria-label="Loading" />
          <p className="mt-4 text-sm font-medium">{status}</p>
          <p className="mt-1 text-xs text-sub">First load only. Everything runs in your browser.</p>
        </div>
      </div>
    )
  return <ApiContext.Provider value={ctx}>{children}</ApiContext.Provider>
}
