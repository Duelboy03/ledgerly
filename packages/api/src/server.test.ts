import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './server'
import { DEMO_PASSWORD } from './seed'
import { makeWorld } from './testkit'

let app: ReturnType<typeof createApp>
let strict: ReturnType<typeof createApp>

beforeAll(async () => {
  const w = await makeWorld()
  app = createApp(w.services)
  strict = createApp(w.services, { loginAttempts: 3 })
}, 60_000)

const login = async (email: string, a = app) => {
  const res = await request(a).post('/api/auth/login').send({ email, password: DEMO_PASSWORD })
  return res.body.token as string
}

describe('HTTP API', () => {
  it('answers health and hides the framework', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('requires a bearer token on protected routes', async () => {
    expect((await request(app).get('/api/employees')).status).toBe(401)
    expect((await request(app).get('/api/employees').set('Authorization', 'Bearer junk')).status).toBe(401)
  })

  it('logs in and serves the directory', async () => {
    const token = await login('meera.kapoor@northwind.test')
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(14)
    expect(res.body[0]).not.toHaveProperty('annualSalaryCents')
  })

  it('enforces roles over HTTP', async () => {
    const meera = await login('meera.kapoor@northwind.test')
    const hr = await login('priya.raman@northwind.test')
    expect((await request(app).get('/api/payroll/runs').set('Authorization', `Bearer ${meera}`)).status).toBe(403)
    expect((await request(app).get('/api/payroll/runs').set('Authorization', `Bearer ${hr}`)).status).toBe(200)
  })

  it('returns structured validation errors', async () => {
    const t = await login('meera.kapoor@northwind.test')
    const res = await request(app).post('/api/leave/requests').set('Authorization', `Bearer ${t}`).send({ type: 'vacation', startDate: 'x', endDate: 'y' })
    expect(res.status).toBe(422)
    expect(res.body.error).toMatchObject({ code: 'invalid' })
  })

  it('treats a malformed id as not found rather than a server error', async () => {
    const t = await login('priya.raman@northwind.test')
    const res = await request(app).get('/api/employees/not-a-uuid').set('Authorization', `Bearer ${t}`)
    expect(res.status).toBe(404)
  })

  it('rejects invalid JSON bodies and unknown routes', async () => {
    const t = await login('priya.raman@northwind.test')
    const bad = await request(app).post('/api/leave/requests/validate').set('Authorization', `Bearer ${t}`).set('Content-Type', 'application/json').send('{oops')
    expect(bad.status).toBe(400)
    expect((await request(app).get('/api/nope').set('Authorization', `Bearer ${t}`)).status).toBe(404)
  })

  it('runs the leave cycle through HTTP', async () => {
    const meera = await login('meera.kapoor@northwind.test')
    const arjun = await login('arjun.mehta@northwind.test')
    const created = await request(app).post('/api/leave/requests').set('Authorization', `Bearer ${meera}`).send({ type: 'personal', startDate: '2026-11-23', endDate: '2026-11-23' })
    expect(created.status).toBe(200)
    const decided = await request(app).post(`/api/leave/requests/${created.body.id}/approve`).set('Authorization', `Bearer ${arjun}`).send({ note: 'ok' })
    expect(decided.body.status).toBe('approved')
  })

  it('rate-limits repeated sign-in attempts', async () => {
    const codes: number[] = []
    for (let i = 0; i < 5; i++) codes.push((await request(strict).post('/api/auth/login').send({ email: 'x@y.z', password: 'bad' })).status)
    expect(codes.slice(0, 3)).toEqual([401, 401, 401])
    expect((await request(strict).post('/api/auth/login').send({ email: 'x@y.z', password: 'bad' })).body.error.code).toBe('rate_limited')
  })
})
