import { describe, it, expect } from 'vitest'
import { ok, err, isOk, isErr, map, mapErr, andThen, unwrapOr, type Result } from '../src/index.js'

describe('Result', () => {
  it('constructs Ok/Err and narrows via guards', () => {
    expect(isOk(ok(1))).toBe(true)
    expect(isErr(ok(1))).toBe(false)
    expect(isErr(err('boom'))).toBe(true)
  })

  it('map transforms only Ok', () => {
    expect(map(ok(2), (x) => x * 3)).toEqual(ok(6))
    const e: Result<number, string> = err('bad')
    expect(map(e, (x) => x * 3)).toEqual(err('bad'))
  })

  it('mapErr transforms only Err', () => {
    expect(mapErr(err(1), (n) => n + 1)).toEqual(err(2))
    expect(mapErr(ok('v'), (n: number) => n)).toEqual(ok('v'))
  })

  it('andThen chains and short-circuits on Err', () => {
    const half = (n: number): Result<number, string> => (n % 2 === 0 ? ok(n / 2) : err('odd'))
    expect(andThen(ok(8), half)).toEqual(ok(4))
    expect(andThen(ok(7), half)).toEqual(err('odd'))
    expect(andThen(err<string>('pre'), half)).toEqual(err('pre'))
  })

  it('unwrapOr returns fallback on Err', () => {
    expect(unwrapOr(ok(5), 0)).toBe(5)
    const e: Result<number, string> = err('x')
    expect(unwrapOr(e, 9)).toBe(9)
  })
})
