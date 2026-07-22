import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import {
  bootstrapBaserowControlSchema,
  createBaserowControlStore,
  type BaserowControlDb,
} from '@linx/infra-baserow'

let client: PGlite
let db: BaserowControlDb

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const result = await client.query(text, params ? [...params] : undefined)
      return result.rows as R[]
    },
  }
  await bootstrapBaserowControlSchema(db)
})

afterEach(async () => {
  await client.close()
})

describe('Baserow one-time controls', () => {
  it('stores only invite hashes and permits exactly one claim before expiry', async () => {
    const store = createBaserowControlStore(db, {
      clock: () => new Date('2026-07-22T00:00:00Z'),
      randomToken: () => 'invite-secret-token',
    })
    const invite = await store.createInvite('admin')
    expect(invite.token).toBe('invite-secret-token')
    const raw = await db.execute<{ token_hash: string }>('SELECT token_hash FROM baserow_team_invites')
    expect(raw[0]?.token_hash).not.toContain(invite.token)
    expect(await store.claimInvite(invite.token, 'u1')).toBe(true)
    expect(await store.claimInvite(invite.token, 'u2')).toBe(false)
  })

  it('consumes launch tickets once and rejects replayed HMAC nonces', async () => {
    let tokenIndex = 0
    const store = createBaserowControlStore(db, {
      clock: () => new Date('2026-07-22T00:00:00Z'),
      randomToken: () => `token-${++tokenIndex}`,
    })
    const launch = await store.createLaunchTicket('u1', 'personal')
    expect(await store.consumeLaunchTicket(launch.ticket)).toEqual({ userId: 'u1', targetSpace: 'personal' })
    expect(await store.consumeLaunchTicket(launch.ticket)).toBeUndefined()
    expect(await store.rememberNonce('a'.repeat(32))).toBe(true)
    expect(await store.rememberNonce('a'.repeat(32))).toBe(false)
  })
})
