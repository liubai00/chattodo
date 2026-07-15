import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { AI_ERRORS_DDL, makeAiErrorRepo, type Queryable } from '../src/index.js'

let client: PGlite
let db: Queryable
let n = 0
const clk = () => new Date(new Date('2026-07-15T09:00:00').getTime() + n++ * 60_000)

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of AI_ERRORS_DDL) await client.exec(s)
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

describe('AiErrorRepo', () => {
  it('create logs + all() returns DESC per-user', async () => {
    let i = 0
    const a = makeAiErrorRepo({ db, userId: 'uA', clock: clk, genId: (p) => `${p}_${++i}` })
    await a.create({ rawInput: '坏输入1', message: 'triage failed' })
    await a.create({ rawInput: '坏输入2', message: 'chat failed' })
    await makeAiErrorRepo({ db, userId: 'uB', clock: clk, genId: (p) => `${p}_${++i}` }).create({ message: 'other' })
    const list = await a.all()
    expect(list.map((e) => e.message)).toEqual(['chat failed', 'triage failed']) // DESC
    expect(list).toHaveLength(2) // uB excluded
    expect(list[0]).toMatchObject({ rawInput: '坏输入2' })
  })

  it('tolerates missing fields (defaults empty)', async () => {
    const a = makeAiErrorRepo({ db, userId: 'uA', clock: clk, genId: (p) => `${p}_x` })
    await a.create({})
    expect((await a.all())[0]).toMatchObject({ rawInput: '', message: '' })
  })
})
