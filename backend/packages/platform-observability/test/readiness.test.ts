import { describe, it, expect } from 'vitest'
import { ReadinessRegistry } from '../src/index.js'

describe('ReadinessRegistry', () => {
  it('is ok when empty', async () => {
    expect((await new ReadinessRegistry().check()).ok).toBe(true)
  })

  it('is ok when all checks pass (sync + async)', async () => {
    const r = new ReadinessRegistry()
    r.register('sync', () => true)
    r.register('async', async () => true)
    const res = await r.check()
    expect(res.ok).toBe(true)
    expect(res.checks).toEqual({ sync: true, async: true })
  })

  it('fails when a check returns false or throws', async () => {
    const r = new ReadinessRegistry()
    r.register('good', () => true)
    r.register('bad', () => false)
    r.register('boom', () => {
      throw new Error('down')
    })
    const res = await r.check()
    expect(res.ok).toBe(false)
    expect(res.checks.good).toBe(true)
    expect(res.checks.bad).toBe(false)
    expect(res.checks.boom).toBe(false)
  })

  it('unregister removes a check', async () => {
    const r = new ReadinessRegistry()
    r.register('x', () => false)
    r.unregister('x')
    expect((await r.check()).ok).toBe(true)
  })
})
