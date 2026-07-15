import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { SETTINGS_DDL, makeSettingsRepo, makeAgentRepo, type Queryable } from '../src/index.js'

let client: PGlite
let db: Queryable

const clock = () => new Date('2026-07-15T09:30:00')

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of SETTINGS_DDL) await client.exec(s)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  // bootstrap 预置行（UPDATE-only）
  await client.query(`INSERT INTO app_settings (user_id, updated_at) VALUES ('uA','2026-07-01T00:00:00')`)
  await client.query(`INSERT INTO agent_profile (user_id, updated_at) VALUES ('uA','2026-07-01T00:00:00')`)
})
afterEach(async () => {
  await client.close()
})

describe('SettingsRepo', () => {
  it('get returns bootstrap defaults', async () => {
    const s = await makeSettingsRepo({ db, userId: 'uA', clock }).get()
    expect(s).toMatchObject({
      workspaceMode: 'work',
      privacyMode: false,
      defaultView: 'dashboard',
      aiVisibility: 'visible_scope_only',
      notifPrefs: {},
      theme: 'light',
      friendPolicy: 'open',
    })
  })

  it('update merges only present keys + bumps updated_at; serializes privacyMode/notifPrefs/friendPolicy', async () => {
    const repo = makeSettingsRepo({ db, userId: 'uA', clock })
    const s = await repo.update({ privacyMode: true, workspaceMode: 'personal', notifPrefs: { due: true }, friendPolicy: 'closed' })
    expect(s).toMatchObject({
      privacyMode: true,
      workspaceMode: 'personal',
      notifPrefs: { due: true },
      friendPolicy: 'closed',
      defaultView: 'dashboard', // 未改
      updatedAt: '2026-07-15T09:30:00',
    })
  })

  it('friendPolicy whitelist: illegal value falls back to open', async () => {
    const repo = makeSettingsRepo({ db, userId: 'uA', clock })
    const s = await repo.update({ friendPolicy: 'garbage' })
    expect(s?.friendPolicy).toBe('open')
  })

  it('empty patch just bumps updated_at', async () => {
    const repo = makeSettingsRepo({ db, userId: 'uA', clock })
    const s = await repo.update({})
    expect(s?.updatedAt).toBe('2026-07-15T09:30:00')
    expect(s?.workspaceMode).toBe('work')
  })

  it('privacyMode false serializes to 0', async () => {
    const repo = makeSettingsRepo({ db, userId: 'uA', clock })
    await repo.update({ privacyMode: true })
    const s = await repo.update({ privacyMode: false })
    expect(s?.privacyMode).toBe(false)
  })
})

describe('AgentRepo', () => {
  it('get returns empty defaults; update merges present keys + updated_at', async () => {
    const repo = makeAgentRepo({ db, userId: 'uA', clock })
    expect(await repo.get()).toMatchObject({ soul: '', memory: '', preferences: '' })
    const a = await repo.update({ soul: '严谨可靠', memory: '用户偏好晨间规划' })
    expect(a).toMatchObject({ soul: '严谨可靠', memory: '用户偏好晨间规划', workingStyle: '', updatedAt: '2026-07-15T09:30:00' })
  })
})
