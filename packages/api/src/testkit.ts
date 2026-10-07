import { createPgliteDb } from './db/pglite'
import { migrate } from './db/migrations'
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemo } from './seed'
import { createServices, type Services } from './services'
import { LocalApi } from './api'

export const TODAY = '2026-10-07'

/** A fresh in-memory Postgres, migrated and seeded, with the clock pinned to TODAY. */
export async function makeWorld(opts: { payrollHistory?: boolean; today?: string } = {}): Promise<{
  services: Services
  as: (who: keyof typeof DEMO_ACCOUNTS | string) => Promise<LocalApi>
}> {
  const db = await createPgliteDb()
  await migrate(db)
  const services = createServices(db, { jwtSecret: 'test-secret-test-secret-test-secret', bcryptRounds: 4, today: () => opts.today ?? TODAY })
  await seedDemo(services, { today: opts.today ?? TODAY, withPayrollHistory: opts.payrollHistory ?? false })
  return {
    services,
    as: async (who) => {
      const api = new LocalApi(services)
      await api.login((DEMO_ACCOUNTS as Record<string, string>)[who] ?? who, DEMO_PASSWORD)
      return api
    },
  }
}
