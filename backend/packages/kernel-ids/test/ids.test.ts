import { describe, it, expect } from 'vitest'
import { uuidv7, makePrefixedId } from '../src/index.js'

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuidv7', () => {
  it('matches the v7 layout (version + variant bits)', () => {
    expect(uuidv7(0x0192_3456_789a)).toMatch(UUID_V7_RE)
  })

  it('is lexicographically time-ordered', () => {
    const earlier = uuidv7(1_000)
    const later = uuidv7(2_000)
    expect(earlier < later).toBe(true)
  })

  it('embeds the millisecond timestamp in the first 48 bits', () => {
    const id = uuidv7(0x0192_3456_789a)
    const hex = id.replace(/-/g, '').slice(0, 12)
    expect(hex).toBe('0192_3456_789a'.replace(/_/g, ''))
  })
})

describe('makePrefixedId', () => {
  it('prefixes the generated id', () => {
    const makeTaskId = makePrefixedId('task')
    const id = makeTaskId(1_000)
    expect(id.startsWith('task_')).toBe(true)
    expect(id.slice('task_'.length)).toMatch(UUID_V7_RE)
  })
})
