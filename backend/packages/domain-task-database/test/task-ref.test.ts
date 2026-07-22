import { describe, expect, it } from 'vitest'
import { decodeTaskRef, encodeTaskRef, isTaskRef } from '../src/index.js'

describe('TaskRef', () => {
  it('roundtrips the stable LinX/Baserow string form', () => {
    const ref = { space: 'personal' as const, tableId: 42, rowId: 9 }
    expect(encodeTaskRef(ref)).toBe('brw:personal:42:9')
    expect(decodeTaskRef('brw:personal:42:9')).toEqual(ref)
    expect(isTaskRef(ref)).toBe(true)
  })

  it('rejects malformed, zero, negative, and unsafe identifiers', () => {
    for (const value of ['task_1', 'brw:other:1:2', 'brw:team:0:2', 'brw:team:-1:2', 'brw:team:1:x']) {
      expect(decodeTaskRef(value)).toBeUndefined()
    }
    expect(() => encodeTaskRef({ space: 'team', tableId: 0, rowId: 1 })).toThrow()
  })
})
