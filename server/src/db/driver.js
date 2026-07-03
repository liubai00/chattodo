import pg from 'pg'
import { PGlite } from '@electric-sql/pglite'
import { config } from '../config.js'

// node-postgres 默认把 int8/bigint（如 COUNT(*)）返成字符串；统一解析为 number，
// 与 PGlite 行为一致，避免上层到处写 ::int 或类型判断。
pg.types.setTypeParser(20, (v) => (v == null ? null : parseInt(v, 10)))

// 统一的异步数据库驱动。两套实现同一接口：
//   get(sql, params)  → 第一行 | undefined
//   all(sql, params)  → 行数组
//   run(sql, params)  → { rowCount }
//   tx(async fn)      → 事务内 fn 收到 { get, all, run }
//   exec(sql)         → 多语句（建表）
// 生产用 pg 连独立 PG 容器；测试/本地无 DATABASE_URL 时用 PGlite（WASM 版真 Postgres，进程内）。
//
// 仓库层沿用 better-sqlite3 的 ? 占位写法，这里自动转成 PG 的 $1,$2…（我们的 SQL 字符串里没有字面量 ?）。
function toPg(sql) { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)) }

// prepare() 兼容垫片：让沿用 better-sqlite3 写法的测试只需加 await（get/all/run 变异步）。
function prepareShim(driver) {
  return (sql) => ({
    get: (...p) => driver.get(sql, p),
    all: (...p) => driver.all(sql, p),
    run: (...p) => driver.run(sql, p),
  })
}

// pg 的 SELECT/INSERT/UPDATE 无参多语句在简单查询协议下不允许；exec 专供无参建表脚本。
function wrapPg(pool) {
  const q = (sql, params = []) => pool.query(toPg(sql), params)
  const d = {
    kind: 'pg',
    get: async (sql, params = []) => (await q(sql, params)).rows[0],
    all: async (sql, params = []) => (await q(sql, params)).rows,
    run: async (sql, params = []) => { const r = await q(sql, params); return { rowCount: r.rowCount, changes: r.rowCount } },
    exec: async (sql) => { await pool.query(sql) },
    async tx(fn) {
      const client = await pool.connect()
      const api = {
        get: async (s, p = []) => (await client.query(toPg(s), p)).rows[0],
        all: async (s, p = []) => (await client.query(toPg(s), p)).rows,
        run: async (s, p = []) => { const r = await client.query(toPg(s), p); return { rowCount: r.rowCount, changes: r.rowCount } },
      }
      try { await client.query('BEGIN'); const out = await fn(api); await client.query('COMMIT'); return out }
      catch (e) { try { await client.query('ROLLBACK') } catch { /* ignore */ } throw e }
      finally { client.release() }
    },
    close: () => pool.end(),
  }
  d.prepare = prepareShim(d)
  return d
}

function wrapLite(lite) {
  const q = (sql, params = []) => lite.query(toPg(sql), params)
  const d = {
    kind: 'pglite',
    get: async (sql, params = []) => (await q(sql, params)).rows[0],
    all: async (sql, params = []) => (await q(sql, params)).rows,
    run: async (sql, params = []) => { const c = (await q(sql, params)).affectedRows ?? 0; return { rowCount: c, changes: c } },
    exec: async (sql) => { await lite.exec(sql) },
    tx: (fn) => lite.transaction(async (t) => fn({
      get: async (s, p = []) => (await t.query(toPg(s), p)).rows[0],
      all: async (s, p = []) => (await t.query(toPg(s), p)).rows,
      run: async (s, p = []) => { const c = (await t.query(toPg(s), p)).affectedRows ?? 0; return { rowCount: c, changes: c } },
    })),
    close: () => lite.close(),
  }
  d.prepare = prepareShim(d)
  return d
}

// Create a driver. opts.connectionString → pg; opts.pglite/memory → PGlite;
// otherwise pick from config (DATABASE_URL → pg, else in-memory PGlite).
export async function createDriver(opts = {}) {
  const conn = opts.connectionString || (opts.pglite ? '' : config.databaseUrl)
  if (conn) {
    const pool = new pg.Pool({ connectionString: conn, max: opts.max || 10 })
    return wrapPg(pool)
  }
  const lite = await PGlite.create(opts.dataDir || undefined) // undefined → in-memory
  return wrapLite(lite)
}

let _driver = null
export async function getDriver() {
  if (!_driver) {
    _driver = await createDriver({ dataDir: config.databaseUrl ? undefined : config.pgliteDir })
    await applySchema(_driver)
  }
  return _driver
}

// PG-compatible schema (reuses schema.sql — all TEXT/INTEGER, PG-valid).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql')

export async function applySchema(driver) {
  // friendships 表首次引入时：存量用户此前默认全员互见，回填为互相已接受的好友，
  // 避免升级后他们的选人列表突然清空。新库（表和用户一起创建）时 users 为空，自然跳过。
  const had = await driver.get(`SELECT to_regclass('friendships') AS t`)
  await driver.exec(readFileSync(SCHEMA_PATH, 'utf8'))
  if (!had || !had.t) await backfillFriendMesh(driver)
  return driver
}

async function backfillFriendMesh(db) {
  const users = await db.all(`SELECT id FROM users ORDER BY created_at`)
  if (users.length < 2) return 0
  const now = new Date().toISOString()
  let n = 0
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      await db.run(
        `INSERT INTO friendships (id,requester_id,addressee_id,status,created_at,responded_at) VALUES (?,?,?,'accepted',?,?)`,
        ['fr_bf_' + i + '_' + j + '_' + Math.random().toString(36).slice(2, 8), users[i].id, users[j].id, now, now],
      )
      n++
    }
  }
  if (n) console.log(`friendships: backfilled ${n} pre-existing user pair(s) as accepted friends`)
  return n
}
