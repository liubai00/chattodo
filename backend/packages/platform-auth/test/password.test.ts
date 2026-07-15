import { describe, it, expect } from 'vitest'
import { randomBytes, scryptSync } from 'node:crypto'
import { hashPassword, verifyPassword, extractBearer } from '../src/index.js'

// 复刻现网 hashPassword 生成旧格式，用于验证透明兼容 + rehash 标记
function legacyScryptHash(pw: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pw, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

describe('password hashing', () => {
  it('hashPassword produces an argon2id hash that verifies', async () => {
    const h = await hashPassword('correct horse battery staple')
    expect(h.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword('correct horse battery staple', h)).toEqual({
      valid: true,
      needsRehash: false,
    })
  })

  it('rejects a wrong password against argon2', async () => {
    const h = await hashPassword('right')
    expect((await verifyPassword('wrong', h)).valid).toBe(false)
  })

  it('verifies legacy scrypt hashes AND flags needsRehash', async () => {
    const legacy = legacyScryptHash('s3cret-pass')
    expect(await verifyPassword('s3cret-pass', legacy)).toEqual({ valid: true, needsRehash: true })
    expect(await verifyPassword('nope', legacy)).toEqual({ valid: false, needsRehash: false })
  })

  it('handles malformed/empty stored hashes safely', async () => {
    for (const bad of ['', 'garbage', 'onlysalt:', ':onlyhash', 'a:zz']) {
      expect((await verifyPassword('x', bad)).valid).toBe(false)
    }
  })

  it('non-string password fails gracefully instead of throwing (untrusted body robustness)', async () => {
    const legacy = legacyScryptHash('x')
    const argon = await hashPassword('x')
    for (const pw of [123, undefined, null, {}] as unknown[]) {
      expect((await verifyPassword(pw as string, legacy)).valid).toBe(false)
      expect((await verifyPassword(pw as string, argon)).valid).toBe(false)
    }
  })

  it('argon2id hash uses the pinned OWASP cost params', async () => {
    const h = await hashPassword('x')
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })
})

describe('extractBearer', () => {
  it('extracts the token', () => {
    expect(extractBearer('Bearer abc123')).toBe('abc123')
    expect(extractBearer('bearer XYZ')).toBe('XYZ')
  })
  it('returns undefined for missing/invalid headers', () => {
    expect(extractBearer(undefined)).toBeUndefined()
    expect(extractBearer(null)).toBeUndefined()
    expect(extractBearer('Basic abc')).toBeUndefined()
    expect(extractBearer('')).toBeUndefined()
  })
})
