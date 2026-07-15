import { describe, it, expect, afterEach } from 'vitest'
import { createPgliteDb, applyMigrations, type PgliteDbHandle } from '../src/index.js'

let h: PgliteDbHandle | undefined

afterEach(async () => {
  if (h) {
    await h.close()
    h = undefined
  }
})

describe('platform-db · PGlite', () => {
  it('ping returns true on a live db', async () => {
    h = await createPgliteDb()
    expect(await h.ping()).toBe(true)
  })

  it('execute runs parameterized SQL', async () => {
    h = await createPgliteDb()
    await h.execute('CREATE TABLE t (id int, name text)')
    await h.execute('INSERT INTO t VALUES ($1, $2)', [1, 'a'])
    const rows = await h.execute<{ id: number; name: string }>('SELECT * FROM t WHERE id = $1', [1])
    expect(rows).toEqual([{ id: 1, name: 'a' }])
  })

  it('withTransaction commits on success', async () => {
    h = await createPgliteDb()
    await h.execute('CREATE TABLE t (id int)')
    await h.withTransaction(async (tx) => {
      await tx.query('INSERT INTO t VALUES (1)')
      await tx.query('INSERT INTO t VALUES (2)')
    })
    const [row] = await h.execute<{ c: number }>('SELECT count(*)::int AS c FROM t')
    expect(row?.c).toBe(2)
  })

  it('withTransaction rolls back on throw', async () => {
    h = await createPgliteDb()
    await h.execute('CREATE TABLE t (id int)')
    await expect(
      h.withTransaction(async (tx) => {
        await tx.query('INSERT INTO t VALUES (1)')
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    const [row] = await h.execute<{ c: number }>('SELECT count(*)::int AS c FROM t')
    expect(row?.c).toBe(0)
  })

  it('withTransaction returns the callback result', async () => {
    h = await createPgliteDb()
    const out = await h.withTransaction(async (tx) => {
      const r = await tx.query<{ n: number }>('SELECT 41 + 1 AS n')
      return r.rows[0]?.n
    })
    expect(out).toBe(42)
  })

  it('applyMigrations is idempotent and records a ledger', async () => {
    h = await createPgliteDb()
    const migs = [
      { id: '0001_init', up: 'CREATE TABLE m (id int)' },
      { id: '0002_more', up: 'ALTER TABLE m ADD COLUMN name text' },
    ]
    const first = await applyMigrations(h, migs)
    expect(first.applied).toEqual(['0001_init', '0002_more'])

    const second = await applyMigrations(h, migs)
    expect(second.applied).toEqual([])

    await h.execute('INSERT INTO m (id, name) VALUES (1, $1)', ['x'])
    const [row] = await h.execute<{ c: number }>('SELECT count(*)::int AS c FROM m')
    expect(row?.c).toBe(1)
  })

  it('applyMigrations runs MULTI-statement up scripts (drizzle-kit baseline shape)', async () => {
    h = await createPgliteDb()
    const migs = [
      {
        id: '0001_multi',
        up: 'CREATE TABLE a (id int);\nCREATE TABLE b (id int);\nINSERT INTO a VALUES (1);',
      },
    ]
    const res = await applyMigrations(h, migs)
    expect(res.applied).toEqual(['0001_multi'])
    // 全部三条语句都执行了
    const [a] = await h.execute<{ c: number }>('SELECT count(*)::int AS c FROM a')
    const [b] = await h.execute<{ c: number }>('SELECT count(*)::int AS c FROM b')
    expect(a?.c).toBe(1)
    expect(b?.c).toBe(0)
  })

  it('applyMigrations rolls back a failing (transactional) migration atomically', async () => {
    h = await createPgliteDb()
    const migs = [{ id: '0001_bad', up: 'CREATE TABLE ok (id int); SELECT * FROM nonexistent_tbl;' }]
    await expect(applyMigrations(h, migs)).rejects.toThrow()
    // 迁移整体回滚：ok 表不应存在，台账无记录
    const [ledger] = await h.execute<{ c: number }>(
      "SELECT count(*)::int AS c FROM __linx_migrations WHERE id = '0001_bad'",
    )
    expect(ledger?.c).toBe(0)
    const exists = await h.execute<{ present: boolean }>(
      "SELECT to_regclass('public.ok') IS NOT NULL AS present",
    )
    expect(exists[0]?.present).toBe(false)
  })

  it('applyMigrations supports noTransaction migrations', async () => {
    h = await createPgliteDb()
    const migs = [{ id: '0001_nt', up: 'CREATE TABLE nt (id int)', noTransaction: true }]
    const res = await applyMigrations(h, migs)
    expect(res.applied).toEqual(['0001_nt'])
    // 再次应用应跳过
    const again = await applyMigrations(h, migs)
    expect(again.applied).toEqual([])
    await h.execute('INSERT INTO nt VALUES (1)')
    const [row] = await h.execute<{ c: number }>('SELECT count(*)::int AS c FROM nt')
    expect(row?.c).toBe(1)
  })

  it('createPgliteDb exposes a drizzle instance and is idempotent to close', async () => {
    h = await createPgliteDb()
    expect(h.db).toBeDefined()
    expect(h.kind).toBe('pglite')
    await h.close()
    await h.close() // 二次 close 不抛（幂等）
    h = undefined
  })
})
