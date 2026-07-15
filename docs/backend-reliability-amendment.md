# LinX 后端 · 运行时可靠性与数据面裁决 ADR（评审收口）

> 状态：**Accepted / 施工前必读**。本文是对抗式评审（`backend-architecture-review.md`）遗留的 B1–B4 / H5–H10 / M·L 项的**终裁**，与四份细化文档并读即可开工。凡本文与既有文档冲突，**以本文为准**，并在 §D 明列"改哪个文档的哪节成什么"。
> 裁决红线只有两条，全部服务于硬约束：**不静默丢数据**、**不破坏前端契约**。任何为"未来可能分库/未来可能换 provider"付出的、正在削弱这两条的成本，一律回退为二期可选项。
>
> **事实核对（基于源码实读）**：`deploy/docker-compose.yml` 现网单 `chattodo-redis` 配 `--appendonly no --maxmemory 64mb --maxmemory-policy allkeys-lru`，`container_name: chattodo-api` + 固定 `127.0.0.1:8788:8787`，无 `TZ` env；`server/src/lib/ids.js` `nowIso()` 用本地墙钟方法（`getHours` 等），无 `TZ` 时 `node:*`/`postgres:16-alpine` 默认 **UTC** → naive TEXT 极大概率是 UTC，硬编码 `Asia/Shanghai` 是 +8h 损坏风险。

---

## A. 🔴 Blocker 逐个关闭

### B1 — Redis 可靠性地基：物理拆两实例（易失缓存 ⟂ 可靠数据面）

**最终裁决**

1. **Redis 逻辑库（`SELECT n`）无法解决本问题**：`maxmemory` / `maxmemory-policy` / `appendonly` 都是**服务器级**配置，同一 Redis 进程的 16 个逻辑库共享同一驱逐策略与持久化。因此 ADR-000 #11 "cache/ratelimit/events/queue 分逻辑库或前缀" 对 BullMQ **不成立**——必须**物理拆两个 Redis 实例/容器**。
2. **实例 A `chattodo-redis-cache`**（易失）：`allkeys-lru` + 无持久化。承 `platform-cache`、`platform-eventbus`(Pub/Sub 不存 key，驱逐无关)、`platform-auth` 的 session 热缓存（PG 为真相源，被驱逐仅回源 PG，正确性不损）。
3. **实例 B `chattodo-redis-durable`**（可靠）：`noeviction` + `appendonly yes`（AOF `everysec`）。承 `platform-queue`(BullMQ)、`platform-idempotency`、`platform-ratelimit`。`noeviction` 下内存满会**写失败报错而非静默丢 key**——这正是我们要的（配合监控/告警 + 充足 `maxmemory`）。

**各 `platform-*` 连哪个实例**

| 包 | 实例 | 策略理由 |
|---|---|---|
| `platform-cache` | cache (LRU) | 丢 = 回源重算，可接受 |
| `platform-eventbus` (Pub/Sub) | cache | Pub/Sub 不落 key，eviction 无关；实时可丢，REST 兜底 |
| `platform-auth` session 热缓存 | cache | 被驱逐 → `resolve` 回源 PG，正确性不损（吊销延迟见 M2） |
| `platform-queue` (BullMQ) | **durable** | **BullMQ 硬性要求 `noeviction` + 持久化**，否则重启丢 job |
| `platform-idempotency` | **durable** | key 被驱逐 = 幂等失效 = 提醒/通知重复扇出 |
| `platform-ratelimit` | **durable** | 计数被驱逐 = 限流静默放宽 = 登录爆破敞口 |

> BullMQ 的 ioredis 连接必须 `maxRetriesPerRequest: null` 且 `enableReadyCheck: false`（BullMQ 强约束）；durable 实例只给这三类用途，AOF 体积可控。

**修订后的 docker-compose 片段**

```yaml
services:
  # 易失缓存 + 实时 Pub/Sub —— 可 LRU、不持久化（承接现网 chattodo-redis 语义）
  chattodo-redis-cache:
    image: redis:7-alpine
    # 去 container_name（见 H5，为 --scale 让路）
    command: ["redis-server","--save","","--appendonly","no",
              "--maxmemory","64mb","--maxmemory-policy","allkeys-lru"]
    restart: unless-stopped
    healthcheck: { test: ["CMD","redis-cli","ping"], interval: 30s, timeout: 3s, retries: 3 }
    logging: { driver: json-file, options: { max-size: "5m", max-file: "2" } }

  # 可靠数据面 —— noeviction + AOF，承 BullMQ / 幂等 / 限流
  chattodo-redis-durable:
    image: redis:7-alpine
    command: ["redis-server","--appendonly","yes","--appendfsync","everysec",
              "--maxmemory","512mb","--maxmemory-policy","noeviction"]
    volumes:
      - chattodo-redis-aof:/data          # AOF 落盘卷，重启不丢 job/幂等键
    restart: unless-stopped
    healthcheck: { test: ["CMD","redis-cli","ping"], interval: 30s, timeout: 3s, retries: 3 }
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }

volumes:
  chattodo-data:
  chattodo-pgdata:
  chattodo-redis-aof:                      # 新增
```

api/worker 环境变量由单一 `REDIS_URL` 拆为两条（见 M6 / §D）：

```yaml
    environment:
      - REDIS_CACHE_URL=redis://chattodo-redis-cache:6379
      - REDIS_DURABLE_URL=redis://chattodo-redis-durable:6379
      - DATABASE_URL=postgres://chattodo:...@chattodo-postgres:5432/chattodo
```

**监控红线**：durable 实例 `used_memory / maxmemory > 80%` 即告警；`noeviction` 下若写失败，BullMQ `add` 抛错 → 上游必须有 DLQ/降级（想法仍走 `create_idea` 落库，不丢）。

---

### B2 — TEXT→timestamptz 时区回填：先核实，禁硬编码 `Asia/Shanghai`

**最终裁决**：迁移文档 §4.3 的 `AT TIME ZONE 'Asia/Shanghai'` **作废**。事实已核对——`nowIso()` 用 `getHours()` 等**本地墙钟**方法，compose **未设 `TZ`**，`node:*`/`postgres:16-alpine` 默认 **UTC**，故存量 naive TEXT **极大概率是 UTC 墙钟**。硬编码 CST 会让全库时间 **+8h 系统性偏移且迁移"成功"无报错**。源时区必须**实测确定**，并参数化为迁移变量 `:src_tz`（默认 `'UTC'`，经核实后写死）。

**第一步：确定实际写入 TZ（在现网容器执行，只读，单次 SSH 内批量完成）**

```bash
# 1) 容器时区取证
docker exec chattodo-api sh -lc 'echo "TZ=$TZ"; date; node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date().toString())"'
docker exec chattodo-postgres sh -lc 'echo "TZ=$TZ"; date -u; date'
docker exec chattodo-postgres psql -U chattodo -d chattodo -c "SHOW timezone; SELECT now();"
```

```bash
# 2) 金丝雀实证（决定性）：现网新建一行，立刻比对其文本时间与真实 UTC
docker exec chattodo-postgres date -u
docker exec chattodo-postgres psql -U chattodo -d chattodo -c \
  "SELECT id, created_at FROM tasks ORDER BY created_at DESC LIMIT 1;"
#    若 created_at ≈ T_real（差<秒级）→ 写入即 UTC → src_tz='UTC'
#    若 created_at ≈ T_real + 8h        → 写入即 CST → src_tz='Asia/Shanghai'
```

```sql
-- 3) 抽样 + 异常值扫描（确认无已带时区的脏值）
SELECT count(*) FILTER (WHERE due_at ~ 'Z$|[+-][0-9]{2}:?[0-9]{2}$') AS already_tz,
       count(*) FILTER (WHERE due_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}') AS malformed
FROM tasks WHERE due_at IS NOT NULL AND due_at <> '';
-- 断言 already_tz = 0 且 malformed = 0，否则先清洗再回填
```

**第二步：dry-run diff（回填前人工核对，不改动列）**

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_at_ts timestamptz;  -- 影子列
SELECT id, due_at AS raw_text,
       (due_at::timestamp AT TIME ZONE :'src_tz') AS as_utc,
       to_char((due_at::timestamp AT TIME ZONE :'src_tz') AT TIME ZONE :'src_tz',
               'YYYY-MM-DD"T"HH24:MI:SS') AS roundtrip
FROM tasks WHERE due_at IS NOT NULL AND due_at <> '' ORDER BY created_at DESC LIMIT 100;
-- 校验1：roundtrip 与 raw_text 逐字符相等（证明纯标注、无双重转换）
-- 校验2（决定性）：随机取已知真实时刻记录，人工确认 as_utc 对应真实 UTC 瞬间
```

**第三步：确认为 UTC 后的回填（`0002` expand → backfill → `0003` contract）**

```sql
-- 0002_time_to_timestamptz.backfill —— 事务外、分批、幂等、可续跑（见 H9）
UPDATE tasks SET due_at_ts = (due_at::timestamp AT TIME ZONE 'UTC')   -- ← 实测为 UTC 才用 'UTC'
WHERE due_at IS NOT NULL AND due_at <> '' AND due_at_ts IS NULL;      -- 幂等谓词，断点续跑
```
```sql
-- 0003_time_to_timestamptz.contract —— 确认无误、旧代码下线后
ALTER TABLE tasks DROP COLUMN due_at;
ALTER TABLE tasks RENAME COLUMN due_at_ts TO due_at;
```

**回退脚本**

```sql
-- 0002.down —— timestamptz 影子列 → 原 naive TEXT
UPDATE tasks SET due_at = to_char(due_at_ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS')
 WHERE due_at_ts IS NOT NULL;
ALTER TABLE tasks DROP COLUMN due_at_ts;
```

> 边界：`nowIso` 秒恒 `:00`、`nowIsoMs` 带毫秒、`daysFromNow` 为 `:00:00`，均是合法 `::timestamp` 字面量；`''` 空串显式排除。**并在 compose 全容器钉 `TZ=UTC`**，消除双写窗口期新写入的歧义。

---

### B3 — 错误信封矛盾：拍平级 `error:string`（不破前端）

**最终裁决**：以 **API 契约文档 §2.1 的解为准**（前端读 `body.error` 为字符串，嵌套对象会渲染 `[object Object]`）。**横切文档 §1.2 / §1.3 的嵌套 `error:{code,message,...}` 作废。** 成功体裸传（逐端点冻结形状），失败体平级。

```jsonc
// 成功：无信封，裸 payload（Task[] / {ok:true} / ConversationDto ...）
// 失败：
{
  "error": "消息太频繁了，请稍后再试",   // 人类可读、脱敏；前端现有读法不变（冻结）
  "code": "RATE_LIMITED",                // 程序判别（新增，加法兼容）
  "requestId": "018f...-7b3c",           // 贯穿日志（ADR-018）
  "details": { "retryAfterSec": 30 }     // 可选结构化上下文
}
```

```ts
// apps/api/src/plugins/error-handler.ts（替换横切 §1.3 的 handler）
app.setErrorHandler((err, req, reply) => {
  const e = err instanceof AppError ? err
    : mapKnown(err) ?? new AppError('INTERNAL', 500, '服务开小差了，请稍后再试');
  req.log[e.httpStatus >= 500 ? 'error' : 'warn']({ code: e.code, details: e.details, err }, e.message);
  reply.status(e.httpStatus).send({
    error: e.httpStatus >= 500 ? '服务开小差了，请稍后再试' : e.message, // 5xx 吞原始 message 防栈泄漏
    code: e.code, requestId: req.id, details: e.details,
  }); // ← 平级，非嵌套
});
```

**必须改的文档**：横切 §1.2 删嵌套 `ErrorEnvelope`、改平级；§1.3 handler 改平级；**错误码枚举**以 API 契约 §2.3 的 `ERROR_CODES` 为唯一权威，`kernel-errors` 对齐（`VALIDATION`→`VALIDATION_FAILED`，`UPSTREAM_LLM`→`LLM_UNAVAILABLE/_TIMEOUT`）。主 ADR #26 落为本 wire format。

---

### B4 — worker 编排幂等 / 失败路径：DB checkpoint（同事务）+ turn 取消语义

**最终裁决**：BullMQ 重试从头重跑 processor，故整段 LLM 编排的**每个写 action 必须幂等或 checkpoint**。仅 `collab.invite` 标幂等不够，`task.create` 等全部纳入。**首选 DB checkpoint（事务性、抗 Redis flush）**，Redis 幂等键作 HTTP 层双提交去重补充。幂等键：`turnId + actionRef`（`actionRef` = Planner 产 Action 的稳定 `ref`）。

```sql
-- checkpoint 表
CREATE TABLE agent_turn_actions (
  turn_id     text NOT NULL,                -- 对齐 H6：text
  action_ref  text NOT NULL,
  action_type text NOT NULL,
  status      text NOT NULL DEFAULT 'done' CHECK (status IN ('done','failed')),
  entity_kind text, entity_id text,
  performed   jsonb NOT NULL,               -- 缓存 Performed，重放直接回灌
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (turn_id, action_ref)
);
```

```ts
// agent-tools/ToolBelt：写 action + checkpoint 落在同一 DB 事务（崩溃点全提交或全回滚）
async invoke<O>(name: string, raw: unknown): Promise<{ replayed: boolean; performed: Performed }> {
  const t = this.reg.get(name);
  const input = t.input.parse(raw);
  enforceScope(t.scope, input, this.cx);
  const { turnId, actionRef } = this.cx;
  const hit = await this.checkpoints.get(turnId, actionRef);
  if (hit) return { replayed: true, performed: hit.performed };      // 重放短路，跳过副作用
  return this.db.transaction(async (tx) => {
    const out = await t.handler(input, { ...this.cx, tx });          // → app-* use-case（接受 tx）
    await this.checkpoints.put(tx, { turnId, actionRef, actionType: t.name, entity: out.entity, performed: out.performed });
    return { replayed: false, performed: out.performed };
  });
}
```

**SSE 断连 / turn 超时后 job 取消（协作式 + 死线）**

| 触发 | 机制 |
|---|---|
| **SSE 客户端断连** | API `onClose` 置 `turn:cancelled:{turnId}`（cache 实例）；Orchestrator 在**每个 action 边界**检查，命中则停止派发后续写 action，仍跑 Guard/persist 定稿已完成部分，发 `done` |
| **turn 超时** | Orchestrator 注入 `turnDeadline`（默认 120s，`kernel-clock`）；超时中止后续、持久化部分产物、标 `ai_errors`、发 `{event:error, code:'LLM_TIMEOUT'}` |
| **重试边界** | `attempts:3` 仅对可重试错（网络/429/5xx）；领域错误抛 BullMQ `UnrecoverableError` **不重试**；`removeOnComplete/removeOnFail:{age}` 控留存 |

取消是"停止产生**新**副作用"；已 checkpoint 的写不回滚；未开始的写因 checkpoint 缺失，重试或取消都不残留半成品。

---

## B. 🟠 High 裁决（H5–H10）

### H5 — 多副本 compose 真实可跑 + 连接池公式（并诚实降级）

`container_name` + 固定宿主端口双双阻断 `--scale`。裁决：**去 `container_name`、用端口区间、给真 upstream、给池公式**；对 10k/单机**诚实降级为"首期垂直 + ≤3 副本，N=10 属二期（须先上 pgBouncer）"**。

```yaml
  chattodo-api:
    build: { context: .., dockerfile: deploy/api.Dockerfile }
    command: ["node","apps/api/dist/server.js"]
    ports: ["127.0.0.1:8788-8790:8787"]     # 去 container_name；端口区间，支持 --scale
    environment:
      - PG_POOL_MAX=10
      - REDIS_CACHE_URL=redis://chattodo-redis-cache:6379
      - REDIS_DURABLE_URL=redis://chattodo-redis-durable:6379
    depends_on:
      chattodo-postgres: { condition: service_healthy }
      chattodo-redis-durable: { condition: service_healthy }
      chattodo-redis-cache: { condition: service_healthy }
    restart: unless-stopped
    stop_grace_period: 30s
  chattodo-worker:
    build: { context: .., dockerfile: deploy/api.Dockerfile }
    command: ["node","apps/worker/dist/main.js"]
    environment: [ PG_POOL_MAX=8, ... ]
    restart: unless-stopped
    stop_grace_period: 30s
```

```nginx
upstream chattodo_api { least_conn; server 127.0.0.1:8788; server 127.0.0.1:8789; server 127.0.0.1:8790; }
location /todo/api/ {
  proxy_pass http://chattodo_api/api/;
  proxy_buffering off;               # SSE 必须
  proxy_read_timeout 3600s;
}
```

**连接池公式**（防在 pgBouncer 介入前先耗尽 `max_connections=100`）：
```
api_pool_max × api_replicas + worker_pool_max × worker_replicas + headroom(10) ≤ max_connections
例：10×3 + 8×1 + 10 = 48 ≤ 100 ✅（N=3 安全）；10×10 = 100+ ❌ → 必须先上 pgBouncer(transaction 模式)
副本上限 = floor((max_connections − worker_total − headroom) / api_pool_max)
```
北极星④的"线性水平扩"从断言收敛为"首期 ≤3 副本可交付，N 更大是 pgBouncer 二期"。

### H6 — uuid vs text：全文统一为 `text`（放弃 uuid 列类型与正则）

读到 `u_default`/`conv_...` legacy id 时 `uuid` 列类型/正则会崩。裁决：**统一 `text`**，全文对齐：

| 位置 | 现文档 | 改为 |
|---|---|---|
| `infra-*-pg/schema.ts` | `uuid('id').primaryKey()` | `text('id').primaryKey().$type<Id>()` |
| `kernel-types.asUuid` | uuid 正则 | 去正则；`Id = string & brand`，接受 legacy 与 UUIDv7；`newId()=uuidv7()` 仅新行 |
| `contracts-http` `Uuid` | `z.string().uuid()` | `z.string().min(1)`（否则存量 id 校验失败） |

"UUIDv7 仅作新值生成策略，不作列类型"；整库 remap 保留为二期高风险独立回退。

### H7 — 同库该加的 FK 就加（别为不会发生的分库牺牲完整性）

10k/单机永不分库，"零 FK + 事件保完整性"是过度设计降硬约束（项目删除→`project_id` 悬垂，事件一丢即永久孤儿）。裁决：**同库 FK 补齐**，领域事件只保留跨聚合副作用。

```sql
-- 0006_add_fks.expand（先归档孤儿→再加约束；additive、可回退）
INSERT INTO _orphans_archive SELECT 'tasks', to_jsonb(t) FROM tasks t
  LEFT JOIN projects p ON t.project_id = p.id WHERE t.project_id IS NOT NULL AND p.id IS NULL;
UPDATE tasks t SET project_id = NULL
  WHERE project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id=t.project_id);
ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_user     FOREIGN KEY (user_id)        REFERENCES users(id)      ON DELETE CASCADE,
  ADD CONSTRAINT fk_tasks_project  FOREIGN KEY (project_id)     REFERENCES projects(id)   ON DELETE SET NULL,
  ADD CONSTRAINT fk_tasks_idea     FOREIGN KEY (source_idea_id) REFERENCES todo_ideas(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee)       REFERENCES users(id)      ON DELETE SET NULL;
ALTER TABLE task_collaborators
  ADD CONSTRAINT fk_collab_task  FOREIGN KEY (task_id)  REFERENCES tasks(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_collab_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
```

**澄清**：FK 是 **DB 层**约束（归 `packages/migrations`），**不违反** §5.4 的 `no-cross-domain`（那是**代码 import** 边界）。数据文档 §5 "不加跨 context FK 便于分库"一句**删除**。

### H8 — outbox 表 DDL + relay 去重锁

```sql
CREATE TABLE outbox (
  id text PRIMARY KEY,                       -- UUIDv7 字符串（对齐 H6）
  aggregate text NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, last_error text
);
CREATE INDEX idx_outbox_due ON outbox (next_attempt_at) WHERE status IN ('pending','failed');
```

```sql
-- relay claim（多 worker 副本安全）
WITH claimed AS (
  SELECT id FROM outbox WHERE status IN ('pending','failed') AND next_attempt_at <= now()
   ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 100)
UPDATE outbox o SET status='processing' FROM claimed c WHERE o.id=c.id RETURNING o.*;
```

relay 以 `idempotencyKey = outbox.id` enqueue 到 BullMQ（durable）；消费者幂等（B4）→ 重复 enqueue 效果不重复。触发：业务写与 `INSERT outbox` 同事务；relay `LISTEN outbox_new` + **兜底轮询 1s**。**谁跑 relay = `apps/worker`**，拓扑用 A（多副本 + `SKIP LOCKED`，无单点）。

### H9 — 迁移双类：schema DDL 单事务 ⟂ 数据回填事务外分批可续跑

| 类 | 标记 | 事务 | 用途 |
|---|---|---|---|
| **schema DDL** | 默认 | 单事务 | 加列/表/约束、小表 `CREATE INDEX` |
| **data backfill / 并发索引** | `-- linx:migration type=nontx` | **无事务**，分批幂等续跑 | 大表回填(B2 时区)、`CREATE INDEX CONCURRENTLY` |

```ts
const nontx = /^--\s*linx:migration\s+type=nontx/m.test(sql);
if (nontx) { await pool.query(sql); }
else { await pool.query('BEGIN'); await pool.query(sql); await pool.query('COMMIT'); }
```
```ts
// 分批回填（apps/worker，事务外、幂等、可续跑）
async function backfillTimestamptz(pool, table, col, srcTz) {
  for (;;) {
    const { rowCount } = await pool.query(`
      WITH batch AS (SELECT id FROM ${table}
        WHERE ${col} IS NOT NULL AND ${col} <> '' AND ${col}_ts IS NULL
        LIMIT 5000 FOR UPDATE SKIP LOCKED)
      UPDATE ${table} t SET ${col}_ts = (t.${col}::timestamp AT TIME ZONE $1)
        FROM batch b WHERE t.id=b.id`, [srcTz]);
    if (rowCount === 0) break;
    await sleep(50);                          // 让位在线写、控 WAL
  }
}
```
CI `migrate:check` 对 backfill 类跑"部分执行→中断→续跑→结果一致"用例。

### H10 — "结构上不可能"表述降级 + 收紧 app→app

**Agent 层**确实结构无环（Agent 间零 import，成立）；但 **app 层** `app-social→app-collaboration` 仅被 CI `no-circular` 事后拦截。裁决：①多 Agent §8 表述改"**Agent 层结构无环；app 层跨 context 循环由 CI 门禁拦截并经下条规则收紧**"；②加 depcruise：

```js
{ name:'app-cross-only-via-query', severity:'error',
  from:{ path:'^packages/app-([^/]+)/' },
  to:{ path:'^packages/app-(?!\\1)[^/]+/src/(?!query)' } }  // 跨 app 仅可 import .../query
```

---

## C. 跨文档矛盾与过度设计消解

### M1 — 包数量收口到确切数 + 诚实标注 ①⑤ 张力

| 分类 | 首期(P1–P6) | 终态 | 停止条件应用 |
|---|---|---|---|
| kernel-* | 3 | 3 | types/errors/clock；`Result` 并入 errors → 定 **3** |
| contracts-* | 2 | 2 | http/events |
| platform-* | 12 | 12 | §5.2 去重（`platform-ratelimit` 原重复列） |
| domain-* | 8 | 10 | 首期 settings 并 agents、authz 并 social |
| app-* | 8 | 9 | 同上 |
| infra-*-pg | 8 | 9 | |
| agent-* | 0（P7 前不建） | 16 | 7 内核 + 9 专职 → 定 **16** |
| migrations / apps | 1 + 2 | 1 + 2 | |
| **合计** | **≈ 36** | **≈ 54** | 取 **54** 为终态定数（落"45–60"下沿） |

**①⑤ 张力诚实标注**（写入结构文档 §5.3）："新增一实体需动 `domain/app/infra/contracts/apps` 5 处 + 5 个 tsconfig references，是 ⑤ 对 ① 的确定成本。" **首期降样板税**：叶子 context（notify/projects/settings）先用**一 context 单包 + 文件夹级 depcruise 规则**（层间禁令，边界照样强制、免 npm-package × 5 配置税）；God-file 所在的 tasks/agents **首期即 layer×context 全拆**。

### M2 — 会话吊销延迟：pub/sub busting + 短 TTL 双保险

`revoke`/`revokeAllExcept` 时在 **cache 实例** pub/sub 发 `session.revoked`，各副本清缓存；session 缓存 TTL 上限 **60s**。**最大吊销延迟 = min(pub/sub≈亚秒, TTL 60s)**——pub/sub 丢失也会在 60s 内因 TTL 回源 PG 生效。写入 ADR-008 / 横切 §2.1。

### M4 — 生产关停序列（api/worker 分别定义，syncToFs 仅测试）

```
apps/api SIGTERM:  1 关监听  2 /ready→503(摘流)  3 排空在途 HTTP(≤30s)  4 关 SSE(令客户端重连)  5 关 pg.Pool→Redis
apps/worker SIGTERM: 1 worker.close()(停拉新job、等 active 完成)  2 relay 完成当前批  3 关 BullMQ/Redis→pg.Pool
```
compose 两服务加 `stop_grace_period: 30s`。**`syncToFs` 明确标注：仅 PGlite 测试 harness，生产 pg.Pool 无此步**（改主 ADR §11、横切 §6、多 Agent §7）。

### M5 — 中文检索走 pg_trgm

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_tasks_trgm ON tasks
  USING gin ((coalesce(title,'') || ' ' || coalesce(notes,'')) gin_trgm_ops);
```
数据文档 §3 全文检索行改为"**中文默认 trgm GIN**，`simple` FTS 补 latin"（`simple` 不切中文词）。

### M6 — REDIS_URL 条件必填（拆两 URL）

```ts
const Env = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  REDIS_CACHE_URL: z.string().url().optional(),
  REDIS_DURABLE_URL: z.string().url().optional(),
}).superRefine((v, ctx) => {
  if (v.NODE_ENV === 'production')
    for (const k of ['REDIS_CACHE_URL','REDIS_DURABLE_URL'] as const)
      if (!v[k]) ctx.addIssue({ code:'custom', path:[k], message:'required in production' });
});
```
横切 §4 的"`REDIS_URL` 必填"改为**条件必填 + 双 URL**，保留 dev 无 Redis 进程内回退。

### L1 — 依赖膨胀：Vercel AI SDK / OTel / FlowProducer 标"二期按需"

首期：`platform-llm` 用**精简手写 fetch adapter**（保留 Port，二期换 SDK 非破坏）；**OTel 不接**（pino+prom-client 足够）；**FlowProducer 不用**（`add/process` 够 10k）。改主 ADR #21/#22/#25、多 Agent §7 标"二期按需，Port 已隔离"，尊重"仅 6 依赖"的克制。

### L3 — 收紧 agent→app 边界（仅 `agent-tools` 可 import `app-*`）

```js
{ name:'agent-app-only-via-tools', severity:'error',
  from:{ path:'^packages/agent-(?!tools)' }, to:{ path:'^packages/app-' } }
```

---

## D. ADR-000 速查表修订项 + P0 施工前检查清单

### D.1 主决策记录（`backend-decisions.md`）具体修订

| ADR / 行 | 原决策 | **改为** |
|---|---|---|
| #11 ADR-010 platform-redis | "分逻辑库或前缀" | **物理拆两实例**：cache(LRU) ⟂ durable(noeviction+AOF)（B1）|
| #16 ADR-007 ID | UUIDv7，schema `uuid` 列 | **列保 `text`**，UUIDv7 仅新值生成；去 uuid 列类型与正则（H6）|
| #17 ADR-007 时间 | 回填 `AT TIME ZONE 'Asia/Shanghai'` | **实测源 TZ（预期 UTC）**，参数化 `:src_tz`，禁硬编码（B2）|
| #18 platform-config | `REDIS_URL` 必填 | **拆双 URL、条件必填**（M6）|
| #20 ADR-013 可靠投递 | outbox→BullMQ（无表/无锁） | **补 outbox DDL + relay `SKIP LOCKED`**（H8）|
| #21 ADR-014 队列 | BullMQ + FlowProducer | **FlowProducer 二期**（L1）|
| #22 ADR-015 LLM | Vercel AI SDK 为传输 | **首期手写 fetch adapter**（L1）|
| #25 ADR-018 可观测 | OTel 可选 | **OTel 二期**，仅 pino+prom-client（L1）|
| #26 ADR-006 错误信封 | "类型化统一序列化"（未拍） | **平级 `{error:string,code,requestId,details?}` + 成功裸传**（B3）|
| ADR-002 包数量 | 45–60（未定数）| **终态 54（枚举定数）；首期叶子 context 文件夹级边界**（M1）|
| ADR-008 会话 | 缓存无失效 | **revoke pub/sub busting + TTL≤60s**（M2）|
| ADR-020 部署 | `--scale api=N` 断言 | **去 container_name/端口区间/upstream/池公式；N≤3 首期**（H5）|
| §11 多处 | syncToFs 当生产不变量 | **api/worker 分别定义关停序列；syncToFs 仅测试**（M4）|
| 新增 | — | **ADR-021 Redis 可靠性拓扑** / **ADR-022 worker 幂等+turn 取消** / **ADR-023 同库 FK 完整性** / **ADR-024 迁移双类** |

**其它文档联动改动**：横切 §1.2/§1.3/§2.1/§4/§5.1/§6/§8；数据文档 §3/§4.3/§4.4/§5；多 Agent §7/§8 + L1；迁移文档 §5.2/§9.2；API 契约 §2.3（`ERROR_CODES` 定为全局唯一枚举）。

### D.2 "必须先关闭才能进入 P0 施工"检查清单

| # | 门禁项 | 判据 | 关联 |
|---|---|---|---|
| ☐ 1 | Redis 拓扑落地 | compose 起 cache + durable 两实例，durable `noeviction+AOF`；BullMQ ioredis `maxRetriesPerRequest:null` | B1 |
| ☐ 2 | **源时区实证** | 金丝雀比对确定 `src_tz`（预期 UTC）；`already_tz=0 && malformed=0`；全容器钉 `TZ=UTC` | B2 |
| ☐ 3 | 时区回填演练 | dry-run diff 人工核对无偏移；`0002` 走 nontx 分批；`0002.down` 冒烟绿 | B2/H9 |
| ☐ 4 | 错误信封统一 | 横切 §1.2 改平级；`ERROR_CODES` 单一枚举；契约对拍 `error` 仍为 string | B3 |
| ☐ 5 | worker 幂等 | `agent_turn_actions` 就绪；ToolBelt 写+checkpoint 同事务；崩溃重放用例绿 | B4 |
| ☐ 6 | turn 取消语义 | SSE 断连/超时协作式取消；领域错走 `UnrecoverableError` 不重试 | B4 |
| ☐ 7 | outbox 骨架 | outbox DDL + relay `SKIP LOCKED` + LISTEN/NOTIFY+1s；relay 归 apps/worker | H8 |
| ☐ 8 | id 类型统一 | schema/`asUuid`/契约 `Uuid` 全改 text/去正则；存量 `u_default` 序列化通过 | H6 |
| ☐ 9 | FK 完整性 | `0006` 归档孤儿→加 FK；确认与 depcruise 代码边界不冲突 | H7 |
| ☐ 10 | 迁移双类 runner | runner 认 `type=nontx`；`migrate:check` 覆盖续跑；`CREATE INDEX CONCURRENTLY` 走 nontx | H9 |
| ☐ 11 | 边界规则收紧 | depcruise 加 `app-cross-only-via-query` + `agent-app-only-via-tools`，CI 红线 | H10/L3 |
| ☐ 12 | 包数量定案 | 终态 54 枚举写入 ADR-002；叶子 context 首期文件夹级边界 | M1 |
| ☐ 13 | 依赖克制 | 首期无 Vercel AI SDK / OTel / FlowProducer；Port 已隔离 | L1 |
| ☐ 14 | 多副本冒烟 | 去 container_name + 端口区间；`--scale chattodo-api=2` 起，跨实例限流/session/SSE 生效；池公式核算 ≤ max_connections | H5 |
| ☐ 15 | 关停序列 | api/worker 各自 SIGTERM 序列 + `stop_grace_period:30s`；syncToFs 标测试态 | M4 |

**一句话收口**：Redis 拆"易失 ⟂ 可靠"两实例托住可靠投递/幂等/限流；时区回填先实证（预期 UTC）禁硬编码；错误信封拍平级 `error:string` 保前端；worker 每写 action 走 DB checkpoint 同事务 + 协作式取消灭重复副作用；同库补 FK、outbox 补 DDL+锁、迁移分 DDL/回填两类、边界从"声明"升"门禁"。以上 15 项全绿，设计集即可作为 P0–P1 施工图，且不会静默丢数据或破坏前端契约。
