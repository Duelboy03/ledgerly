import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import type { LeaveAction, PayFrequency } from '@ledgerly/domain'
import { AppError, notFound } from './errors'
import type { Actor } from './authz'
import type { Services } from './services'

interface Options {
  /** allowed browser origins; omit to disable CORS (same-origin only) */
  corsOrigins?: string[]
  /** failed-login budget per IP per window */
  loginAttempts?: number
  loginWindowMs?: number
}

declare module 'express-serve-static-core' {
  interface Request {
    actor?: Actor
  }
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).then((out) => (out === undefined ? res.status(204).end() : res.json(out)), next)

export function createApp(s: Services, opts: Options = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  if (opts.corsOrigins) app.use(cors({ origin: opts.corsOrigins }))
  app.use(express.json({ limit: '100kb' }))

  // A small in-memory limiter on login. Behind a real proxy you would use a shared store.
  const hits = new Map<string, { n: number; reset: number }>()
  const budget = opts.loginAttempts ?? 10
  const windowMs = opts.loginWindowMs ?? 60_000
  const limitLogin = (req: Request, _res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown'
    const now = Date.now()
    const h = hits.get(key)
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs })
    else if (++h.n > budget) return next(new AppError(401, 'rate_limited', 'Too many sign-in attempts. Wait a minute and try again.'))
    next()
  }

  const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.header('authorization') ?? ''
      const token = header.startsWith('Bearer ') ? header.slice(7) : undefined
      req.actor = (await s.auth.authenticate(token)).actor
      next()
    } catch (e) {
      next(e)
    }
  }

  const api = express.Router()
  api.get('/health', (_req, res) => res.json({ ok: true }))
  api.post('/auth/login', limitLogin, wrap(async (req) => s.auth.login(req.body?.email, req.body?.password)))
  api.get('/meta', wrap(() => s.meta()))

  api.use(authenticate)
  const me = (req: Request) => req.actor!
  api.get('/me', wrap(async (req) => (await s.auth.authenticate(req.header('authorization')?.slice(7))).user))

  api.get('/employees', wrap((req) => s.employees.directory(me(req))))
  api.get('/employees/:id', wrap((req) => s.employees.get(me(req), String(req.params.id))))
  api.patch('/employees/:id', wrap((req) => s.employees.update(me(req), String(req.params.id), req.body)))

  api.get('/leave/balances', wrap((req) => s.leave.balances(me(req), (req.query.employeeId as string) || undefined)))
  api.get('/leave/requests', wrap((req) => s.leave.list(me(req), (req.query.scope as 'mine' | 'team' | 'all') || 'mine')))
  api.get('/leave/approvals', wrap((req) => s.leave.approvals(me(req))))
  api.post('/leave/requests/validate', wrap((req) => s.leave.validate(me(req), req.body)))
  api.post('/leave/requests', wrap(async (req) => s.leave.create(me(req), req.body)))
  api.post('/leave/requests/:id/:action', wrap((req) => s.leave.decide(me(req), String(req.params.id), req.params.action as LeaveAction, req.body?.note)))
  api.get('/leave/calendar', wrap((req) => s.leave.calendar(me(req), String(req.query.month ?? ''))))

  api.get('/timesheets/:employeeId', wrap((req) => s.timesheets.list(me(req), String(req.params.employeeId), String(req.query.from), String(req.query.to))))
  api.put('/timesheets/:employeeId', wrap(async (req) => {
    await s.timesheets.save(me(req), String(req.params.employeeId), req.body)
  }))

  api.get('/payroll/periods', wrap((req) => s.payroll.periods(me(req), String(req.query.frequency), Number(req.query.year))))
  api.post('/payroll/preview', wrap((req) => s.payroll.preview(me(req), req.body)))
  api.post('/payroll/runs', wrap((req) => s.payroll.commit(me(req), req.body)))
  api.get('/payroll/runs', wrap((req) => s.payroll.runs(me(req))))
  api.get('/payroll/runs/:id', wrap((req) => s.payroll.run(me(req), String(req.params.id))))
  api.get('/paychecks/mine', wrap((req) => s.payroll.myPaychecks(me(req))))
  api.get('/paychecks/:id', wrap((req) => s.payroll.paycheck(me(req), String(req.params.id))))

  api.get('/audit', wrap((req) => s.audit.list(me(req))))

  api.use((_req, _res, next) => next(notFound('Route')))
  app.use('/api', api)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } })
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: { code: 'bad_json', message: 'Request body is not valid JSON.' } })
    // invalid uuid and similar database errors should not surface as 500s with internals
    if (typeof err === 'object' && err && 'code' in err && ['22P02'].includes(String((err as { code: unknown }).code)))
      return res.status(404).json({ error: { code: 'not_found', message: 'Record not found.' } })
    console.error(err)
    res.status(500).json({ error: { code: 'internal', message: 'Something went wrong on our side.' } })
  })
  return app
}

export type { PayFrequency }
