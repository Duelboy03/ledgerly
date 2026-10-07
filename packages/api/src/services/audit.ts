import { can, ensure, type Actor } from '../authz'
import { camelAll, type Db } from '../db/types'
import type { AuditEntry } from '../types'

export async function record(
  db: Db,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  detail: Record<string, unknown> = {},
) {
  await db.query('INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1, $2, $3, $4, $5)', [
    actorId,
    action,
    entity,
    entityId,
    JSON.stringify(detail),
  ])
}

export function createAudit(db: Db) {
  return {
    async list(actor: Actor, limit = 100): Promise<AuditEntry[]> {
      ensure(can.readAudit(actor), 'Only HR can read the audit log.')
      const rows = await db.query(
        `SELECT a.id::int AS id, a.at, e.name AS actor_name, a.action, a.entity, a.entity_id, a.detail
           FROM audit_log a LEFT JOIN employees e ON e.id = a.actor_id
          ORDER BY a.id DESC LIMIT $1`,
        [Math.min(500, Math.max(1, limit))],
      )
      return camelAll<AuditEntry>(rows)
    },
  }
}
