import { describe, it, expect } from 'vitest'
import { runWithReqId, getReqId } from '../src/index.js'

describe('reqId AsyncLocalStorage', () => {
  it('is undefined outside any context', () => {
    expect(getReqId()).toBeUndefined()
  })

  it('propagates within a context and restores after', () => {
    const inside = runWithReqId('req-abc', () => getReqId())
    expect(inside).toBe('req-abc')
    expect(getReqId()).toBeUndefined()
  })

  it('nests correctly', () => {
    runWithReqId('outer', () => {
      expect(getReqId()).toBe('outer')
      runWithReqId('inner', () => {
        expect(getReqId()).toBe('inner')
      })
      expect(getReqId()).toBe('outer')
    })
  })

  it('survives across an await boundary', async () => {
    const seen = await runWithReqId('async-1', async () => {
      await Promise.resolve()
      return getReqId()
    })
    expect(seen).toBe('async-1')
  })
})
