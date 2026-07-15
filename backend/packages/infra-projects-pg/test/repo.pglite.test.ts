import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { PROJECTS_DDL, makeProjectRepo, type Queryable } from '../src/index.js'

let client: PGlite
let db: Queryable
let n = 0

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const stmt of PROJECTS_DDL) await client.exec(stmt)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  n = 0
})
afterEach(async () => {
  await client.close()
})

function repo(userId = 'uA') {
  return makeProjectRepo({ db, userId, genId: (p) => `${p}_t${++n}` })
}

describe('ProjectRepo (PGlite)', () => {
  it('create applies defaults and roundtrips', async () => {
    const p = await repo().create({ name: 'MVP 文档' })
    expect(p).toMatchObject({
      name: 'MVP 文档',
      description: '',
      status: 'active',
      privacyScope: 'work',
    })
    expect(await repo().get(p.id)).toMatchObject({ id: p.id, name: 'MVP 文档' })
  })

  it('all is user-scoped, created_at order', async () => {
    const r = repo('uA')
    const a = await r.create({ name: 'A' })
    const b = await r.create({ name: 'B' })
    await repo('uB').create({ name: 'other' })
    expect((await r.all()).map((p) => p.id)).toEqual([a.id, b.id])
  })

  it('get is user-scoped (stranger project invisible)', async () => {
    const other = await repo('uB').create({ name: 'secret' })
    expect(await repo('uA').get(other.id)).toBeUndefined()
  })
})
