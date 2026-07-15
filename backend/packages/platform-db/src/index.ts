// @linx/platform-db — Drizzle 实例 + 连接池 + 事务 + advisory-lock 迁移 runner + 就绪 ping。
// 修 P1（手写 db 驱动/repos 内联 SQL）与「多实例迁移竞态」：迁移用 pg_advisory_lock 串行，
// 多副本并发启动只跑一次；结构演进走 expand→contract（见 docs/backend-migration-plan.md §5）。
//
// 双驱动：生产 = node-postgres + pg.Pool；测试/本地 = @electric-sql/pglite（进程内真 PG）。
// 驱动运行时按需 dynamic import，互不加载。Drizzle 实例经 .db 暴露给 P2+ 的 infra-*-pg 仓储；
// 平台层不 import 其它 platform-*（边界：platform 仅依赖 kernel/contracts）。
//
// 关键不变量（经对抗式评审收口）：
//  - 持锁保护区内的全部 SQL 走【同一条锁连接】（LockedRunner），杜绝「持锁 + 从同池再借连接」死锁。
//  - 迁移脚本经 exec 通道执行，支持【多语句】（drizzle-kit 基线）；noTransaction 迁移可跳过 BEGIN/COMMIT
//    以容纳 CREATE INDEX CONCURRENTLY 等不可在事务块内运行的 DDL。
import type { Pool, PoolClient } from 'pg'
import type { PGlite } from '@electric-sql/pglite'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgliteDatabase } from 'drizzle-orm/pglite'

/** 最小参数化执行面（一般事务用） */
export interface SqlExecutor {
  query<R = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: R[] }>
}

/** 迁移/持锁用执行面：额外支持多语句 DDL 脚本（无参数） */
export interface SqlRunner extends SqlExecutor {
  exec(sql: string): Promise<void>
}

/** 持锁保护区句柄：全部操作走锁连接；transaction 在同一连接上 BEGIN/COMMIT */
export interface LockedRunner extends SqlRunner {
  transaction(fn: (tx: SqlRunner) => Promise<void>): Promise<void>
}

/** 驱动无关的连接句柄 */
export interface DbHandle {
  readonly kind: 'pg' | 'pglite'
  /** 就绪探针：SELECT 1 成功即 true（异常吞为 false，供 /ready 聚合） */
  ping(): Promise<boolean>
  /** 单条执行（自动池连接） */
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
  /** 事务：fn 抛出即整体 ROLLBACK，正常即 COMMIT */
  withTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>
  /**
   * advisory 锁保护区：fn 在独占锁下运行，收到绑定到锁连接的 LockedRunner。
   * 生产 = 跨副本 pg_advisory_lock（同进程并发亦串行化）；PGlite = 单进程直跑（无跨会话竞态）。
   */
  withAdvisoryLock<T>(key: number, fn: (runner: LockedRunner) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export interface PgDbHandle extends DbHandle {
  readonly kind: 'pg'
  readonly db: NodePgDatabase<Record<string, never>>
  readonly pool: Pool
}

export interface PgliteDbHandle extends DbHandle {
  readonly kind: 'pglite'
  readonly db: PgliteDatabase<Record<string, never>>
  readonly client: PGlite
}

type RawQueryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
}

function wrapExecutor(q: RawQueryable): SqlExecutor {
  return {
    async query<R = Record<string, unknown>>(text: string, params?: readonly unknown[]) {
      const res = await q.query(text, params ? [...params] : undefined)
      return { rows: res.rows as R[] }
    },
  }
}

// ── 生产：node-postgres ──
export interface CreatePgOptions {
  connectionString: string
  max?: number
  /** 池耗尽/连接不上时的等待上限；默认 10s，避免静默永久挂起 */
  connectionTimeoutMillis?: number
}

export async function createPgDb(opts: CreatePgOptions): Promise<PgDbHandle> {
  const { Pool } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const pool: Pool = new Pool({
    connectionString: opts.connectionString,
    max: opts.max ?? 10,
    connectionTimeoutMillis: opts.connectionTimeoutMillis ?? 10_000,
  })
  const db = drizzle(pool)
  let closed = false

  return {
    kind: 'pg',
    db,
    pool,
    async ping() {
      try {
        await pool.query('SELECT 1')
        return true
      } catch {
        return false
      }
    },
    async execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]) {
      const res = await pool.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
    async withTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>) {
      const client: PoolClient = await pool.connect()
      try {
        await client.query('BEGIN')
        const out = await fn(wrapExecutor(client))
        await client.query('COMMIT')
        return out
      } catch (e) {
        try {
          await client.query('ROLLBACK')
        } catch {
          /* 回滚失败不掩盖原始错误 */
        }
        throw e
      } finally {
        client.release()
      }
    },
    async withAdvisoryLock<T>(key: number, fn: (runner: LockedRunner) => Promise<T>) {
      const client: PoolClient = await pool.connect()
      let unlockErr: unknown
      try {
        await client.query('SELECT pg_advisory_lock($1::bigint)', [key])
        // 全部持锁工作走这条连接（不再从池借新连接 → 与 pool.max 无关，不会自死锁）
        const sql: SqlRunner = {
          async exec(s: string) {
            // 无参 → simple-query 协议，可执行多语句脚本
            await client.query(s)
          },
          async query<R = Record<string, unknown>>(text: string, params?: readonly unknown[]) {
            const r = await client.query(text, params ? [...params] : undefined)
            return { rows: r.rows as R[] }
          },
        }
        const runner: LockedRunner = {
          ...sql,
          async transaction(txfn: (tx: SqlRunner) => Promise<void>) {
            await client.query('BEGIN')
            try {
              await txfn(sql)
              await client.query('COMMIT')
            } catch (e) {
              try {
                await client.query('ROLLBACK')
              } catch {
                /* 保留原始错误 */
              }
              throw e
            }
          },
        }
        try {
          return await fn(runner)
        } finally {
          try {
            await client.query('SELECT pg_advisory_unlock($1::bigint)', [key])
          } catch (e) {
            unlockErr = e // 吞掉：原始 fn 错误优先，且下方 release 会丢弃这条已损连接
          }
        }
      } finally {
        client.release(unlockErr instanceof Error ? unlockErr : undefined)
      }
    },
    async close() {
      if (closed) return
      closed = true
      await pool.end()
    },
  }
}

// ── 测试/本地：PGlite ──
export interface CreatePgliteOptions {
  /** 持久化目录；缺省为内存库（测试用，Windows 上避开持久化初始化坑） */
  dataDir?: string
}

export async function createPgliteDb(opts: CreatePgliteOptions = {}): Promise<PgliteDbHandle> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const client: PGlite = opts.dataDir ? new PGlite(opts.dataDir) : new PGlite()
  await client.waitReady
  const db = drizzle(client)
  let closed = false

  return {
    kind: 'pglite',
    db,
    client,
    async ping() {
      try {
        await client.query('SELECT 1')
        return true
      } catch {
        return false
      }
    },
    async execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
    async withTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>) {
      return client.transaction((tx) => fn(wrapExecutor(tx)))
    },
    // 单进程 PGlite 无跨会话竞态，直跑；持锁工作同样走这唯一 client。
    async withAdvisoryLock<T>(_key: number, fn: (runner: LockedRunner) => Promise<T>) {
      const sql: SqlRunner = {
        async exec(s: string) {
          // PGlite exec 支持多语句脚本（drizzle-kit 基线迁移）
          await client.exec(s)
        },
        async query<R = Record<string, unknown>>(text: string, params?: readonly unknown[]) {
          const r = await client.query(text, params ? [...params] : undefined)
          return { rows: r.rows as R[] }
        },
      }
      const runner: LockedRunner = {
        ...sql,
        async transaction(txfn: (tx: SqlRunner) => Promise<void>) {
          await client.exec('BEGIN')
          try {
            await txfn(sql)
            await client.exec('COMMIT')
          } catch (e) {
            try {
              await client.exec('ROLLBACK')
            } catch {
              /* 保留原始错误 */
            }
            throw e
          }
        },
      }
      return fn(runner)
    },
    async close() {
      if (closed) return
      closed = true
      await client.close()
    },
  }
}

/** 依据配置选择驱动：有 DATABASE_URL 走 pg，否则 PGlite。返回联合类型，narrow .kind 即可取 .db。 */
export async function createDb(opts: {
  databaseUrl: string
  pgliteDir?: string
  max?: number
}): Promise<PgDbHandle | PgliteDbHandle> {
  if (opts.databaseUrl) {
    return createPgDb(
      opts.max !== undefined
        ? { connectionString: opts.databaseUrl, max: opts.max }
        : { connectionString: opts.databaseUrl },
    )
  }
  return createPgliteDb(opts.pgliteDir ? { dataDir: opts.pgliteDir } : {})
}

// ── 迁移 runner（advisory-lock 串行 + 幂等）──
export interface RawMigration {
  id: string
  /** 迁移 SQL（可含多条语句）；drizzle-kit 生成的多语句文件可整体传入 */
  up: string
  /** true → 跳过 BEGIN/COMMIT（用于 CREATE INDEX CONCURRENTLY 等不可在事务块内运行的 DDL） */
  noTransaction?: boolean
}

const MIGRATIONS_TABLE = '__linx_migrations'

/**
 * 应用迁移：advisory-lock 保护 → 建 __linx_migrations 台账 → 逐条跳过已应用 → 每条一个事务（除非 noTransaction）。
 * 多副本并发启动只有一个持锁执行，其余等待后见台账已记录直接跳过 → 幂等、零重复；
 * ledger INSERT 带 ON CONFLICT DO NOTHING 兜底（PGlite 单进程无锁场景防 PK 冲突）。
 */
export async function applyMigrations(
  handle: DbHandle,
  migrations: readonly RawMigration[],
  opts: { lockKey?: number } = {},
): Promise<{ applied: string[] }> {
  const lockKey = opts.lockKey ?? 4021
  return handle.withAdvisoryLock(lockKey, async (runner) => {
    await runner.exec(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
    )
    const doneRows = await runner.query<{ id: string }>(`SELECT id FROM ${MIGRATIONS_TABLE}`)
    const done = new Set(doneRows.rows.map((r) => r.id))
    const applied: string[] = []
    const insertLedger = (r: SqlRunner, id: string): Promise<unknown> =>
      r.query(`INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [id])
    for (const m of migrations) {
      if (done.has(m.id)) continue
      if (m.noTransaction) {
        await runner.exec(m.up)
        await insertLedger(runner, m.id)
      } else {
        await runner.transaction(async (tx) => {
          await tx.exec(m.up)
          await insertLedger(tx, m.id)
        })
      }
      applied.push(m.id)
    }
    return { applied }
  })
}
