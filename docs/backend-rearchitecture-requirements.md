# Chattodo / LinX 灵信 — 后端重构需求文档（Requirements Brief）

> **文档性质**：这是一份**需求与现状说明书**，不是架构设计本身。
> **用途**：交给下一步的「架构设计 AI」作为输入，由它据此产出后端的目标架构、技术选型定稿、目录规范、数据模型、迁移与落地计划。
> **范围**：**仅后端**（`server/`）。前端（本轮已完成模块化 + TS 重构）本次不在范围内。
> **作者视角**：架构师对现有代码的盘点与重构目标定义。
> **更新日期**：2026-07（相对日期已转绝对）。

---

## 0. 一句话目标

在**不改变对外 API 契约、不丢数据、不影响同机现有站点**的前提下，把后端从"能跑但大量手写造轮子、分层与包结构不清晰"的现状，重构成一个**易扩展、分层清晰、目录规范、类型安全、可测可观测**的现代 Node 服务。

---

## 1. 项目背景与业务域（给不了解项目的架构 AI）

Chattodo / LinX「灵信」是一个 **AI-native、对话驱动的 todo/想法处理器**：用户把任何想法丢进聊天框，系统判断它是**任务 / 待澄清想法 / 非 todo 信息**并归档；可通过对话直接对任务增删改查；支持多会话线程、好友与协作、实时推送、可配置的第三方大模型。

**核心业务概念（领域名词）：**
- **Task（任务）**：状态 `todo | in_progress | done | archived`，含截止/计划时间、优先级(1–4)、隐私范围(work/personal/mixed)、项目归属、负责人(assignee)、来源想法。
- **TodoIdea（待澄清想法）**：有行动倾向但不够具体，可澄清后转任务。
- **NonTodo（非 todo 隔离区）**：想法/参考/摘录，不进任务系统。
- **Project（项目）**、**AgentProfile（智能体人格/记忆/偏好）**、**AppSettings（工作区/隐私/通知偏好/主题/AI 可见性/好友策略）**。
- **Capture / 生成记录（capture_records）**：每次输入的 triage 判定与落库溯源；**ai_errors** 记失败。
- **Conversation（会话线程）**：每用户可多个聊天线程，消息归属会话。
- **Friend（好友关系）** + **Collaboration（任务协作者 task_collaborators）** + **auto_rules（记忆驱动自动邀请）**。
- **Notification（通知）**、**Session（登录会话）**、**User（账户名 + 称呼 + 角色）**、**ai_config（运行时模型配置，团队级 + 每用户级）**。

**当前部署形态（约束，见 §8）**：单机 Docker（Fastify API + Postgres 16 + Redis 7），宿主 nginx 挂在子路径 `/todo/`，与同机现有站点（liubai.autos 等）共存、零干扰；另有独立监控后台 SPA 挂 `/todo/admin/`。

---

## 2. 现状盘点（Current State）

### 2.1 技术栈
| 维度 | 现状 |
|---|---|
| 运行时 | Node 22，纯 **ESM JavaScript**（**无 TypeScript**） |
| Web 框架 | Fastify 5（`@fastify/cors`）|
| 数据库 | 生产 Postgres 16（`pg`）；测试/本地 PGlite（进程内真 PG）；历史 `better-sqlite3` 仅用于一次性 SQLite→PG 迁移 |
| 实时 | 自写 Redis pub/sub 事件总线 + 进程内回退；SSE 两条通道（`/api/events`、`/api/chat/stream`）|
| AI | 自写 LLM provider（OpenAI 兼容 + Anthropic + 流式 reply 增量提取）+ 规则版 triage |
| 测试 | `node:test` + PGlite（约 159 用例，绿）|
| 依赖总数 | 仅 6 个生产依赖（fastify、cors、pg、better-sqlite3、pglite、redis）——**其余能力几乎全部手写** |

### 2.2 目录结构（`server/src/`）
```
app.js                      构建 Fastify 实例 + 注册所有路由 + 鉴权 preHandler + 错误处理
server.js                   启动入口 + 事件总线 init + 优雅关闭
config.js                   读 env（无校验）
db/  driver.js              自写异步 DB 驱动（pg/PGlite 双实现，?→$n 转换，bigint parser，prepare 垫片）
     schema.sql             全量建表 + ALTER IF NOT EXISTS + 内联数据回填
     index.js / migrate.js  连接/迁移入口
     seed.js                种子
     bootstrap.js           首启：空库则迁移或种子
     migrate-from-sqlite.js 一次性历史迁移
repositories/index.js       ~380 行单文件：所有实体仓库（对象字面量 + 手写 SQL + 手写 row↔domain 映射）
services/                   chat / agentChat / collab / friends / triage(rule+llm) / capture /
                            tasks / auth / planning / privacy / ideas / search / events
routes/                    每资源一个文件（~20 个），app.js 里手动 register
lib/  ids.js               自写 makeId / nowIso(分钟) / nowIsoMs(毫秒) / daysFromNow
      rateLimit.js         自写内存滑窗限流
      dates.js
```

### 2.3 能正常工作、值得肯定的部分（不要在重构中丢掉）
- **DB 驱动抽象**让"生产 PG / 测试 PGlite"同一套代码跑通——**思路正确**，只是实现手写、无类型。
- **优雅关闭**处理了 PGlite `syncToFs` 落盘（否则半写坏库）——**必须保留**这个关停顺序。
- **诚实守卫 / 协作口径统一（settle + stripInviteClaims）**、**多轮上下文**、**流式 reply 增量提取**、**规则+LLM 双链路 + 失败回退**——是**领域核心资产**，重构要保留其行为与测试。
- **事件总线**已具备"Redis 扇出 + 进程内回退 + 多实例就绪"，可保留（需规范封装）。
- **测试用 PGlite**（真 PG 方言、进程内、Windows 可跑）——好基建，保留。

---

## 3. 现状问题清单（"不规范 / 重复造轮子"逐项）

> 这是本次重构最核心的输入。每项列出：**现状 → 问题 → 成熟替代**。架构设计步骤需针对每一项给出定稿方案。

| # | 领域 | 现状（手写） | 问题 | 成熟替代（候选） |
|---|---|---|---|---|
| P1 | **数据访问** | 自写 `driver.js`（`?→$n`、bigint parser、prepare 垫片）+ `repositories/index.js` 单文件内联 SQL + 手写 `toTask/toIdea…` 映射 | 无类型安全；SQL 分散手拼；映射样板重复；380 行大文件耦合；难扩展/难测 | **Kysely**（类型安全 query builder，贴近 SQL，轻）/ **Drizzle ORM**（TS-first + drizzle-kit 迁移）/ Prisma（重、生态全） |
| P2 | **数据库迁移** | `schema.sql` 全量 exec + `ALTER … IF NOT EXISTS` + 数据回填散落在 schema.sql 与 `applySchema()`；"首次建表检测"回填 friendships/conversations/account_name/friend_policy | 无版本、无回滚、无迁移历史；多人协作冲突；脆弱 | **drizzle-kit** / **node-pg-migrate** / Umzug / Prisma Migrate（版本化 + 回滚 + 历史表） |
| P3 | **认证 / 会话** | 手写 scrypt hash/verify + `sessions` 表存 token + preHandler 手解析 Bearer + 手动 GC + 改密吊销其它会话 | 安全细节自负；无标准中间件；能力有限（无刷新/轮换标准） | **@fastify/jwt**（无状态）或 **@fastify/session + @fastify/cookie**（有状态）；密码 **@node-rs/argon2** 或封装现有 scrypt |
| P4 | **限流** | **两处重复**：`lib/rateLimit.js` 一份 + `routes/auth.js` 内 attempts Map 一份；均为单实例内存（多实例失效，注释已承认） | 重复；多实例不一致 | **@fastify/rate-limit**（可接 Redis store，多实例一致） |
| P5 | **入参校验** | 满地手写 `if (!body.x) return reply.status(400)` + 手拼错误文案 | 不一致；无类型；无自动文档；易漏 | Fastify 原生 **JSON Schema(ajv)** 或 **Zod**（`fastify-type-provider-zod`）+ `@fastify/swagger` 出 OpenAPI |
| P6 | **ID 生成** | 自写 `makeId = prefix + 进程内 counter + base36` | 多实例 counter 各自独立→潜在碰撞；非时间有序 | **uuid v7**（时间有序）/ **nanoid** / cuid2 |
| P7 | **时间戳** | 自写 `nowIso`(分钟精度) + `nowIsoMs`(毫秒)；时间以**本地朴素 ISO 字符串**存 `TEXT`（无时区）；分钟精度曾致会话排序打平 | 无时区/DST 隐患；精度不一；字典序比较脆弱；两套并存 | 列改 **`timestamptz`**，代码统一 **UTC + Date**（必要时 luxon/dayjs） |
| P8 | **配置** | `config.js` 直接读 `process.env`，无校验/无类型 | 缺失或类型错误静默 | **envalid** / **Zod env schema**（启动即校验 + 类型化） |
| P9 | **分层 / 耦合** | 三层存在但：服务互相 import（**collab ↔ friends 循环依赖**）；业务逻辑漏进路由（`tasks.js` 的 `notifyUserByName`、`data.js` clear 直接写 SQL）；`chat.js` ~350 行编排 God-file；settle/strip 领域逻辑混在 collab.js | 依赖方向不受控；跨切面散落；难以独立测试与替换 | 明确 **接口层 / 应用层(use-case) / 领域层 / 基础设施层**，**依赖只准向内**；按 feature 模块拆分 |
| P10 | **错误处理** | 单一 `setErrorHandler` 返回 `{error: msg}`；HTTP 状态码各路由手拼；无错误类型 | 无 `DomainError/ValidationError/AuthError/NotFound` 层级；响应信封不统一 | 定义**错误类层级** + 统一映射 + 一致响应信封 `{code,message,details?}` |
| P11 | **类型系统** | 后端纯 JS；**前端已全面 TS 化** | 跨端 DTO（task/mention/API 形状）无法共享、无编译期保障 | 后端上 **TypeScript**，抽 `packages/shared` 或 OpenAPI 生成，与前端共享类型 |
| P12 | **API 契约 / 文档** | 无 OpenAPI；前后端契约靠人肉同步 | 易漂移；无自动文档/客户端生成 | schema 驱动 + `@fastify/swagger`（OpenAPI）→ 可生成前端类型/客户端 |
| P13 | **可观测性** | 有 pino 日志；无 request-id 贯穿、无 metrics、健康/就绪未分离 | 排障与容量观测弱 | 保留 pino + **request-id 关联**、`/health` vs `/ready`、可选 metrics(prom) |
| P14 | **CI / 质量门禁** | 后端**无 CI**（前端刚加 GH Actions）；`package.json` test 脚本 `node --test` 未指定测试范围；migrate 脚本可能过时 | 无 lint/typecheck/test 门禁 | 后端 CI（lint + typecheck + test + build）；脚本规范化 |
| P15 | **LLM Provider** | 自写 fetch + 手写流式 JSON reply 提取器 + 别名规范化 + 诚实守卫 | 维护成本高；provider 接口不清晰 | 抽象成 **Provider 接口 + 适配器(Strategy)**；可评估官方 SDK / Vercel AI SDK 降负担（保留诚实守卫等领域逻辑） |
| P16 | **事件总线** | 自写 Redis pub/sub + 进程内回退（功能 OK，已多实例就绪） | 无可靠投递保证（pub/sub 丢即丢）；实现耦合 | 可**保留**并规范封装为 `EventBus` 接口；如需可靠投递再评估 Redis Streams |

---

## 4. 目标与设计原则（Goals & Principles）

用户明确的三大目标：
1. **易于扩展**：新增一个实体/一个功能模块（如未来的"标签""看板列""团队空间"）应有清晰、可复制的落点，改动局部化。
2. **架构分析明了**：任何人（或 AI）看目录与依赖图就能理解系统边界、数据流与职责划分。
3. **文件/包结构规范清晰**：目录即架构，命名一致，跨切面集中，无 God-file、无循环依赖。

据此延伸的工程原则（重构必须满足）：
- **分层 + 依赖向内**：接口层(HTTP) → 应用层(use-case/编排) → 领域层(实体/领域服务/仓库接口) → 基础设施层(DB/Redis/LLM/时钟/ID 适配器)。内层不得 import 外层。
- **按 feature 模块化的单体（Modular Monolith）**：与前端新结构（`src/modules/*`）对称，降低认知成本；暂不拆微服务（当前规模不需要）。
- **类型安全端到端**：后端 TS；DTO/契约与前端共享或由 OpenAPI 生成。
- **schema 驱动的边界**：所有入/出参有 schema（校验 + 文档 + 类型三合一）。
- **可测**：领域逻辑纯函数化、基础设施可替换（PGlite 测试保留）、分层测试（单元/集成/契约）。
- **无重复造轮子**：能用成熟库解决的横切关注点（迁移/校验/限流/ID/时间/配置/鉴权）一律采用库，除非有充分理由自研并记录 ADR。
- **可迁移、不破坏**：对外 API 契约稳定；数据零丢失；灰度可回退。

---

## 5. 功能范围 — 必须保留的后端能力清单（Functional Inventory）

> 重构是**架构层面的**，不改变以下对外行为与 API 契约（前端依赖）。逐条都要在新架构中有对应落点与测试。

**认证与账户**：注册 / 登录 / 登出 / me / 改称呼(name)与账户名(account_name) / 改密（吊销其它会话）/ Bearer 会话解析中间件 / 每用户数据隔离（per-user 仓库）/ 首个账号为 admin。

**任务**：CRUD、生命周期(todo/in_progress/done/archived)、详情（子任务/评论/活动日志/生成记录）、纠错 move-out（任务→非 todo，保留溯源 + correction）、视图过滤(view=open/done/today/all + scope + search)、assignee 指派、批量操作。

**待澄清想法 / 非 todo**：convert / archive / discard / convert-to-todo。

**项目**：创建 + 聊天智能归属 + 列表进度。

**Capture 闭环**：triage（规则版 + LLM 版，封装在 Provider 后）→ 落库(task/idea/non_todo) + 写 `capture_records` 溯源 + 失败写 `ai_errors`。

**对话式聊天编排（核心）**：意图识别（greeting/help/plan/query/complete/delete/**modify**/remember/question/capture/**identity**/**friend**）；**通过对话增删改查任务**（含离线规则模式的改期/改优先级/开始执行/改名）；**诚实守卫**（AI 声称已执行但未落地→服务端兜底真执行或如实提示）；**@提及三类**（人/时间/文档，结构化 mentions）；**@成员协作口径统一**（已邀请/待确认/无法邀请三态互斥，剥离 LLM 误断言，匹配成功写协作者 + 责任人）；时间快捷词/结构化时间落库 dueAt；多轮上下文（按会话作用域）；**流式 SSE 回复**；身份/模型提问后端按真实配置直答。

**多对话（会话线程）**：列表 / 新建 / 改名 / 删除 / 取某会话消息 / 消息按会话作用域 / 首条消息自动命名 / 最近活动置顶 / 跨用户注入写对方默认会话。

**好友关系**：按**完整邮箱精确**请求 / 接受 / 拒绝（静默）/ 解除 / 撤回 / 列表（好友/待处理/已发出）/ 反向请求自动成好友 / **隐私开关"谢绝陌生人请求"** / 请求限流 / 通知内联接受拒绝 / SSE 刷新。

**协作**：`task_collaborators` 邀请-确认制 / 关注模式 / 批量邀请 / 记忆驱动自动邀请(`auto_rules`) / 完成进展通知 / 退出协作。**权限收口**：`/api/team`、@提及、指派通知、协作邀请均限定好友圈（服务端强制）。

**通知**：列表 / 全部已读 / 单条已读 / 内联动作(invite/friend_request) / 到期与逾期提醒生成（每任务每天一次）。

**Agent 配置 + 应用设置**：Agent 人格/记忆/偏好/工作方式/隐私规则/追问策略；工作区模式、隐私模式、默认视图、AI 可见性、通知偏好、主题、**friend_policy**；**每用户 AI 配置覆盖团队配置**（含 SSRF 防护的 baseUrl 校验）。

**监控后台 API（只读）**：`/api/admin/overview`、`/api/admin/users/:id`，**admin 角色门禁**（非管理员 403）。

**实时**：SSE `/api/events`（Redis 扇出、心跳、断线重连）+ `/api/chat/stream`（逐字流）。

**数据归属**：全量导出(JSON) / 清空当前账号业务数据（保留账户/设置/会话骨架）。

**搜索**：`/api/search`（命令面板）+ `/api/mentions`（@引用候选）。

**规划**：`planNextBlock` + commit（写 plannedAt，进入"今日"）。

**运维**：健康检查、优雅关闭（PGlite 落盘顺序）、每日 `pg_dump` 备份、（历史）SQLite→PG 迁移。

---

## 6. 非功能需求（NFR）

- **可扩展性**：新增 feature 模块 = 新目录 + 注册，不动核心；新增实体有标准模板（schema→迁移→仓库→用例→路由→测试）。
- **可维护性**：无 God-file（软上限：单文件 < ~250 行）；无循环依赖（CI 可加 dependency-cruiser 校验）；命名/分层一致。
- **类型安全**：后端 TS strict；对外 DTO 有单一事实源。
- **可测试性**：领域纯逻辑单测 + 路由集成测试（PGlite）+ 关键契约测试；覆盖现有 159 用例等价行为。
- **性能**：聊天流式首字节尽快；DB 连接池；避免 N+1（当前部分 map 内 await 逐条查询需在设计中收敛）。
- **可扩展至多实例**：无进程内共享态用于跨实例一致性（限流/事件/会话都要多实例安全）。
- **安全**：参数化查询（禁字符串拼接）、鉴权/授权集中、SSRF 防护（AI baseUrl）、密码哈希、会话轮换、限流、CORS 可收紧、错误不泄露内部细节。
- **可观测**：结构化日志 + request-id；`/health`(存活) 与 `/ready`(依赖就绪) 分离；可选 metrics。
- **DX**：一条命令起本地（含 PGlite）、一条命令跑测试、lint/typecheck/format 到位、清晰 README/架构图。

---

## 7. 技术选型要求与候选（供设计步骤定稿）

> 下列给出**要求 + 候选 + 倾向**。最终定稿由架构设计步骤输出 ADR（含理由与被否方案）。

| 关注点 | 要求 | 候选 | 倾向（可挑战） |
|---|---|---|---|
| 语言/类型 | 端到端类型安全，可与前端共享 DTO | TypeScript | **TS（strict）** |
| Web 框架 | 保留高性能、schema 驱动、生态成熟；避免过度重造 | 保留 **Fastify** / 迁 NestJS(重、DI 内建) / Hono | **保留 Fastify**（已用且轻）；NestJS 作为"要不要强 DI/装饰器"的备选 |
| 数据访问 | 类型安全、贴近 SQL、可测（PGlite）、低魔法 | **Kysely** / **Drizzle** / Prisma | Kysely 或 Drizzle（二选一，看是否要一体化迁移） |
| 迁移 | 版本化 + 可回滚 + 历史表 | drizzle-kit / node-pg-migrate / Umzug | 与数据访问选型配套（Drizzle→drizzle-kit；Kysely→node-pg-migrate/Umzug） |
| 校验/契约 | 入出参 schema = 校验+类型+OpenAPI | Zod(+fastify-type-provider-zod) / TypeBox / JSON Schema | **Zod**（与前端可复用）或 TypeBox（与 ajv/Fastify 原生更贴） |
| 鉴权/会话 | 标准化、多实例安全、可轮换 | @fastify/jwt / @fastify/session+cookie | 有状态会话表已契合当前"改密吊销"，可保留表 + 规范封装；或转 JWT+短期+刷新 |
| 密码哈希 | 现代 KDF | 保留 scrypt(封装) / @node-rs/argon2 | 二选一，记录 ADR |
| 限流 | 多实例一致、去重 | @fastify/rate-limit(+Redis) | **@fastify/rate-limit + Redis store** |
| ID | 唯一、时间有序、多实例安全 | uuid v7 / nanoid | **uuid v7** |
| 时间 | UTC + timestamptz | timestamptz + Date(+luxon 可选) | 列迁 timestamptz，代码统一 UTC |
| 配置 | 启动校验 + 类型 | envalid / zod-env | zod-env 或 envalid |
| 事件总线 | 多实例、可替换 | 保留自写(封装) / Redis Streams | 保留 pub/sub 封装为接口；可靠投递需求出现再升级 |
| LLM | 清晰 Provider 抽象，保留领域守卫 | 自写适配器 / 官方 SDK / Vercel AI SDK | Provider 接口 + 适配器；SDK 可选 |
| 测试 | TS 友好、快、PGlite | 保留 node:test / **Vitest** | Vitest（TS 无需编译、生态好），保留 PGlite 集成 |
| 日志/文档/CI | pino + OpenAPI + 后端 CI | pino / @fastify/swagger / GH Actions | 全部采纳 |

---

## 8. 约束与不可破坏项（Hard Constraints / Invariants）

1. **部署不变**：单机 Docker（API + Postgres 16 + Redis 7），宿主 nginx 挂 `/todo/`，反代 `/todo/api/ → 127.0.0.1:8788`；**绝不影响同机现有站点**（liubai.autos、power.gitlab.uno、默认站）。独立后台仍 `/todo/admin/`。
2. **API 契约稳定**：前端（已 TS 模块化）依赖现有 REST + 两条 SSE 的路径、请求/响应形状；重构期间保持兼容（可加版本前缀但需前端同步）。
3. **数据零丢失**：现网 Postgres 有真实用户数据（约 3 用户）。任何 schema 变更走**版本化迁移**，可回退；不得依赖"删表重建"。
4. **保留关键运行时行为**：优雅关闭的 PGlite 落盘顺序、Redis 扇出 + 进程内回退、诚实守卫/协作口径/流式提取等领域逻辑与其测试。
5. **多实例就绪**：不得引入新的进程内跨实例共享态（限流、会话、事件必须多实例安全）。
6. **安全底线**：参数化查询、SSRF 防护（AI baseUrl 禁 loopback/内网/裸主机）、密码哈希、登录/聊天/好友请求限流、admin 门禁、隐私收口（协作仅好友、账户名/称呼拆分、谢绝陌生人开关）。
7. **HTTPS 待接入**：目前仅 HTTP（缺解析到该 IP 的域名）；架构应为 TLS/反代终止预留位置，不阻塞本次重构。
8. **运维习惯**：远程服务器操作要合并为**单次 SSH 连接**（避免频繁访问被限流）；每日 `pg_dump` 备份 cron 保留。

---

## 9. 目标架构方向（Direction，非定稿）

> 供设计步骤参考的骨架期望；细节由设计步骤定。

- **形态**：Modular Monolith（Fastify）。按 **feature 模块**组织：`auth / users / tasks / ideas / nonTodos / projects / chat / conversations / friends / collaboration / notifications / agent / settings / ai / admin / search / plan / data`。
- **分层（每模块内或全局共享）**：
  - `interface/`（HTTP：路由 + schema + 控制器，只做 IO 与校验，不含业务）
  - `application/`（use-case：编排领域与基础设施，事务边界）
  - `domain/`（实体、值对象、领域服务如 triage/collab-settle、仓库**接口**——纯、可单测、不依赖外层）
  - `infrastructure/`（仓库实现、DB 客户端、Redis/EventBus、LLM 适配器、时钟/ID/哈希适配器）
- **共享内核（shared kernel / cross-cutting）**：错误类型与统一响应信封、id、time/clock、config、logger、eventBus 接口、鉴权中间件、限流、分页。
- **依赖规则**：`interface → application → domain ← infrastructure`；**domain 不 import 任何外层**；模块间通过应用层接口或领域事件通信，**禁止服务间循环 import**（消除 collab↔friends 循环）。
- **契约优先**：每路由 in/out schema → 校验 + OpenAPI + 与前端共享类型（`packages/shared` 或生成）。
- **与前端对称**：目录直觉与前端 `src/modules/*` 一致，降低全栈认知成本。

---

## 10. 迁移策略要求（如何从现状过渡）

- **推荐 Strangler（绞杀者）渐进式**：新架构与旧路由并存，按模块逐个迁移、每迁一个跑契约测试对齐行为，最后下线旧实现；避免一次性大爆炸。
- **数据迁移**：把现有 `schema.sql` + 内联回填**转成版本化迁移基线**（baseline migration 反映当前生产 schema），后续变更增量迁移；`timestamptz`、id 等变更需带数据回填脚本与回退脚本。
- **行为对齐**：以现有 159 个 `node:test` 用例为**回归基线**（迁到 Vitest 后行为等价），关键领域逻辑补契约测试。
- **可回退**：每阶段可独立部署与回滚；灰度期间 API 双跑对拍（可选）。

---

## 11. 下一步「架构设计 AI」应产出的交付物（Deliverables）

请下一步据本文件产出：
1. **目标架构文档**：分层图 + 模块边界 + 依赖规则 + 数据流（capture/chat/collab/realtime 各画一条）。
2. **技术选型定稿 + ADR**：对 §3 每个 P 项与 §7 每个关注点给出选定方案、理由、被否方案（Architecture Decision Records）。
3. **目录/包结构规范**：完整目录树 + 命名约定 + "新增一个实体/模块"的标准步骤模板。
4. **数据模型**：实体关系 + 迁移基线 + 索引/约束 + timestamptz/id 变更方案。
5. **API 契约**：OpenAPI（或等价）+ 与前端类型共享方式。
6. **横切设计**：错误模型与响应信封、鉴权/授权、限流、事件、日志/可观测、配置校验。
7. **测试策略**：分层测试 + 契约测试 + PGlite 集成 + CI 流水线。
8. **分阶段落地计划**：Strangler 阶段划分、每阶段范围/风险/回退、数据迁移顺序、与前端契约对齐节奏。

---

## 12. 范围之外（Out of Scope）

- **前端**（本轮已模块化 + TS 重构完成）。
- **新业务功能**：本次是架构重构，不新增产品功能（除非为消除技术债必需，需在 ADR 说明）。
- **切微服务 / 换语言 / 上 k8s**：当前单机规模不需要，除非设计步骤有充分论证。
- **HTTPS/域名接入**：单独事项，架构为其预留位置即可。

---

## 13. 开放问题（需用户/架构步骤拍板）

1. **数据访问选型**：Kysely（更贴 SQL、更轻）还是 Drizzle（一体化迁移、更 ORM 味）？
2. **框架**：保留 Fastify（推荐）还是引入 NestJS（强 DI/装饰器，团队是否接受其重量）？
3. **会话**：保留有状态会话表（契合"改密吊销其它会话"）还是转 JWT + 刷新令牌？
4. **类型共享**：抽 `packages/shared`（前后端 monorepo 共享 TS 类型）还是走 OpenAPI 生成？是否借此把前后端并入一个 workspace/monorepo？
5. **重构节奏**：Strangler 渐进（推荐、稳）还是在分支上一次性重写后切换（快、险）？
6. **测试框架**：node:test 保留还是迁 Vitest（TS 体验更好）？

---

_本文件为「需求与现状」，请勿在此处写架构设计；设计产物见交付物 §11，建议落在 `docs/backend-architecture-design.md` 与 `docs/adr/`。_
