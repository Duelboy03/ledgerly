export type Row = Record<string, unknown>

/** The only thing the services know about the database. Postgres via `pg`, or PGlite (Postgres compiled to WASM). */
export interface Db {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>
  /** run a script of several statements, with no parameters (migrations) */
  exec(sql: string): Promise<void>
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>
  close(): Promise<void>
}

const camelKey = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

/** snake_case result rows become camelCase objects; timestamps become ISO strings. */
export function camel<T>(row: Row): T {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) out[camelKey(k)] = v instanceof Date ? v.toISOString() : v
  return out as T
}

export const camelAll = <T>(rows: Row[]): T[] => rows.map((r) => camel<T>(r))
