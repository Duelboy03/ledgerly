import bcrypt from 'bcryptjs'
import { jwtVerify, SignJWT } from 'jose'
import type { Role } from '@ledgerly/domain'
import type { Actor } from '../authz'
import { camel, type Db } from '../db/types'
import { unauthorized } from '../errors'
import type { SessionUser } from '../types'
import { record } from './audit'

export interface AuthConfig {
  jwtSecret: string
  /** token lifetime in seconds */
  ttlSeconds?: number
  bcryptRounds?: number
}

interface UserRow {
  userId: string
  email: string
  passwordHash: string
  role: Role
  employeeId: string
  name: string
  title: string
  department: string
  status: string
}

const SELECT_USER = `SELECT u.id AS user_id, u.email, u.password_hash, u.role, u.employee_id,
                            e.name, e.title, e.department, e.status
                       FROM users u JOIN employees e ON e.id = u.employee_id`

const toSession = (u: UserRow): SessionUser => ({
  userId: u.userId,
  employeeId: u.employeeId,
  name: u.name,
  email: u.email,
  role: u.role,
  title: u.title,
  department: u.department,
})

export function createAuth(db: Db, cfg: AuthConfig) {
  const key = new TextEncoder().encode(cfg.jwtSecret)
  const ttl = cfg.ttlSeconds ?? 8 * 3600
  // Compared against when the email is unknown, so response time does not reveal which emails exist.
  const dummyHash = bcrypt.hashSync('not-a-real-password', cfg.bcryptRounds ?? 10)

  return {
    hashPassword: (pw: string) => bcrypt.hash(pw, cfg.bcryptRounds ?? 10),

    async login(email: string, password: string): Promise<{ token: string; user: SessionUser }> {
      const rows = await db.query(`${SELECT_USER} WHERE lower(u.email) = lower($1)`, [String(email ?? '').trim()])
      const u = rows[0] ? camel<UserRow>(rows[0]) : null
      const ok = await bcrypt.compare(String(password ?? ''), u?.passwordHash ?? dummyHash)
      if (!u || !ok || u.status !== 'active') throw unauthorized('Incorrect email or password.')
      await record(db, u.employeeId, 'auth.login', 'user', u.userId)
      const token = await new SignJWT({ eid: u.employeeId, role: u.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(u.userId)
        .setIssuedAt()
        .setExpirationTime(`${ttl}s`)
        .sign(key)
      return { token, user: toSession(u) }
    },

    /** Verifies the signature and expiry, then re-reads the user so a role change or deactivation applies immediately. */
    async authenticate(token: string | undefined): Promise<{ actor: Actor; user: SessionUser }> {
      if (!token) throw unauthorized()
      let sub: string | undefined
      try {
        sub = (await jwtVerify(token, key, { algorithms: ['HS256'] })).payload.sub
      } catch {
        throw unauthorized('Your session has expired. Sign in again.')
      }
      const rows = await db.query(`${SELECT_USER} WHERE u.id = $1`, [sub])
      const u = rows[0] ? camel<UserRow>(rows[0]) : null
      if (!u || u.status !== 'active') throw unauthorized()
      return { actor: { userId: u.userId, employeeId: u.employeeId, role: u.role }, user: toSession(u) }
    },
  }
}
