import { describe, it, expect } from 'vitest'
import { RouteRegistry } from '../src/facade/route-registry.js'

describe('RouteRegistry', () => {
  it('defaults unconfigured groups to legacy', () => {
    const r = new RouteRegistry()
    expect(r.target('tasks')).toBe('legacy')
    expect(r.isNew('tasks')).toBe(false)
  })

  it('honors the configured default', () => {
    const r = new RouteRegistry({ default: 'new' })
    expect(r.target('anything')).toBe('new')
  })

  it('applies initial group map and set() overrides', () => {
    const r = new RouteRegistry({ groups: { tasks: 'new', social: 'legacy' } })
    expect(r.isNew('tasks')).toBe(true)
    expect(r.isNew('social')).toBe(false)
    r.set('social', 'new')
    expect(r.isNew('social')).toBe(true)
  })

  it('applyEnv reads LINX_ROUTE_<GROUP>', () => {
    const r = new RouteRegistry()
    r.applyEnv({ LINX_ROUTE_TASKS: 'new', LINX_ROUTE_FRIEND_OPS: 'new', LINX_ROUTE_X: 'bogus' })
    expect(r.isNew('tasks')).toBe(true)
    expect(r.isNew('friend-ops')).toBe(true)
    expect(r.target('x')).toBe('legacy') // 非法值忽略
  })
})
