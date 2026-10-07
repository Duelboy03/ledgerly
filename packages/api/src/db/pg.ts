import pg from 'pg'
import type { Db } from './types'

const DATE_OID = 1082
pg.types.setTypeParser(DATE_OID, (v: string) => v)

export function createPgDb(connectionString: string, opts: { max?: number } = {}): Db {
  const pool = new pg.Pool({ connectionString, max: opts.max })
  const wrap = (c: pg.Pool | pg.PoolClient, inTx: boolean): Db => ({
    query: async <T>(sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows as T[],
    exec: async (sql) => {
      await c.query(sql)
    },
    transaction: async (fn) => {
      if (inTx) return fn(wrap(c, true))
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const out = await fn(wrap(client, true))
        await client.query('COMMIT')
        return out
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  })
  return wrap(pool, false)
}
