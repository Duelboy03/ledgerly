import { PGlite } from '@electric-sql/pglite'
import type { Db } from './types'

// keep DATE columns as 'YYYY-MM-DD' strings instead of JS Dates (applied per query: the constructor option is ignored)
const DATE_OID = 1082
const PARSERS = { [DATE_OID]: (v: string) => v }

/** `dataDir` may be omitted (in memory), a filesystem path, or `idb://name` in the browser. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const pg = new PGlite(dataDir)
  await pg.waitReady
  const wrap = (q: { query: PGlite['query']; exec: PGlite['exec'] }, tx?: boolean): Db => ({
    query: async <T>(sql: string, params: unknown[] = []) => (await q.query(sql, params, { parsers: PARSERS })).rows as T[],
    exec: async (sql) => {
      await q.exec(sql)
    },
    transaction: async (fn) => {
      if (tx) return fn(wrap(q, true)) // already inside a transaction
      return pg.transaction((t) => fn(wrap(t as unknown as { query: PGlite['query']; exec: PGlite['exec'] }, true)))
    },
    close: () => pg.close(),
  })
  return wrap(pg)
}
