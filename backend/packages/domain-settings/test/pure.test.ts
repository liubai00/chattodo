import { describe, it, expect } from 'vitest'
import { visibleFilter } from '../src/index.js'

const items = [
  { id: 1, privacyScope: 'work' },
  { id: 2, privacyScope: 'personal' },
  { id: 3, privacyScope: 'mixed' },
  { id: 4 }, // no scope
]

describe('visibleFilter', () => {
  it('passthrough (copy) when privacy mode off', () => {
    const out = visibleFilter(items, { privacyMode: false, workspaceMode: 'work' })
    expect(out).toEqual(items)
    expect(out).not.toBe(items) // 返回副本
  })
  it('work mode → keeps work + mixed', () => {
    const out = visibleFilter(items, { privacyMode: true, workspaceMode: 'work' })
    expect(out.map((i) => i.id)).toEqual([1, 3])
  })
  it('personal mode → keeps personal + mixed', () => {
    const out = visibleFilter(items, { privacyMode: true, workspaceMode: 'personal' })
    expect(out.map((i) => i.id)).toEqual([2, 3])
  })
})
