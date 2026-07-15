import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { AI_CONFIG_DDL, makeAiConfigRepo, type Queryable } from '../src/index.js'

let client: PGlite
let db: Queryable
const clock = () => new Date('2026-07-15T10:00:00')

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of AI_CONFIG_DDL) await client.exec(s)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
})
afterEach(async () => {
  await client.close()
})

const repo = (userId = 'uA') => makeAiConfigRepo({ db, userId, clock })

describe('AiConfigRepo', () => {
  it('getTeam falls back to AI_DEFAULTS when no default row', async () => {
    expect(await repo().getTeam()).toEqual({ provider: 'rule', baseUrl: '', model: '', apiKey: '', fallbackToRule: true, updatedAt: null })
  })

  it('getOwn is undefined until set; get() = own || team', async () => {
    const r = repo('uA')
    await r.update({ provider: 'anthropic', model: 'claude', apiKey: 'team-key' }) // team
    expect(await r.getOwn()).toBeUndefined()
    expect(await r.get()).toMatchObject({ provider: 'anthropic', model: 'claude', apiKey: 'team-key' })
    await r.updateOwn({ apiKey: 'my-own-key' }) // personal override
    expect((await r.get()).apiKey).toBe('my-own-key')
  })

  it('update upserts default + dynamic SET only patched keys + bumps updated_at', async () => {
    const r = repo()
    const t = await r.update({ provider: 'openai', baseUrl: 'https://api.x.com/v1', model: 'gpt', fallbackToRule: false })
    expect(t).toMatchObject({ provider: 'openai', baseUrl: 'https://api.x.com/v1', model: 'gpt', fallbackToRule: false, updatedAt: '2026-07-15T10:00:00' })
    // patch only model → other fields retained
    const t2 = await r.update({ model: 'gpt-2' })
    expect(t2).toMatchObject({ provider: 'openai', model: 'gpt-2', fallbackToRule: false })
  })

  it('fallbackToRule serializes to 0/1', async () => {
    const r = repo()
    expect((await r.update({ fallbackToRule: false })).fallbackToRule).toBe(false)
    expect((await r.update({ fallbackToRule: true })).fallbackToRule).toBe(true)
  })

  it('own config is per-user; clearOwn falls back to team', async () => {
    const a = repo('uA')
    await a.update({ provider: 'anthropic', model: 'team-model' }) // shared team row
    await a.updateOwn({ model: 'a-model' })
    expect((await a.get()).model).toBe('a-model')
    // uB has no own → sees team
    expect((await repo('uB').get()).model).toBe('team-model')
    await a.clearOwn()
    expect(await a.getOwn()).toBeUndefined()
    expect((await a.get()).model).toBe('team-model')
  })
})
