以下为本主题的可落库细化文档，严格遵循 ADR-006/007/010/012，并已对齐 `server/src/*` 现网真实契约（路由、SSE 帧、响应形状均来自实读）。

---

# LinX 灵信 · 细化文档 ⑥：API 契约 + 类型共享（ADR-006 展开）

> 上游拍板（不可推翻）：`contracts-*` 仅依赖 `kernel-*`；**API DTO 手写 Zod，不从 Drizzle schema 派生**（drizzle-zod 只做 infra 内部行校验）；Zod 4 + `fastify-type-provider-zod` + `@fastify/swagger`；错误信封类型化 `AppError{code,httpStatus,message,details}`；UUIDv7 / timestamptz-UTC。
> 本文额外承担一个上游未明写、但硬约束「API 契约稳定 + 前端已 TS 模块化依赖」逼出来的**关键取舍**：**现网成功响应是「裸 payload」而非信封**（实测），因此统一信封只作用于 error 与新增集合端点，成功体形状冻结——详见 §2。

---

## 0. 现状契约基线快照（冻结基线，OpenAPI 回归以此为准）

先落一份实测基线，避免「规范化」时把前端依赖的形状改掉。

| 维度 | 现网真实形态（实测） | 对重构的约束 |
|---|---|---|
| 前缀 | 全部 `/api/*`，**无版本段** | §4 用 `/api` = `/api/v1` 别名，不动前端 |
| 成功体 | **裸对象/裸数组**：`GET /api/tasks`→`Task[]`；`GET /api/conversations`→`{conversations:[]}`；`{ok:true}`；`{invites:[]}`；`{rules:[]}` | §2：成功体**不套信封**，逐端点冻结形状 |
| 错误体 | `reply.status(4xx).send({ error: '<中文/英文串>' })`，`error` 是**字符串** | §2：信封保留 `error:string`，仅**旁加** `code/requestId`，不破坏读串的前端 |
| 认证 | `Bearer <token>`（opaque session），`req.user` 注入，per-user 隔离，首账号 admin | preHandler 中间件契约不变 |
| 限流 | `429 { error: '消息太频繁了…' }`（`chat` 40/min/user） | §2 错误码补 `RATE_LIMITED` |
| SSE-A | `GET /api/events`：首帧 `event: hello / data:{"ok":true}`，心跳 `: ping`（25s），业务帧 `event: <kind> / data: <json含kind>`，kind ∈ `refresh|notify|chat|task|friends` | §5 规范化为 discriminated union，帧格式冻结 |
| SSE-B | `POST /api/chat/stream`：`event: status{intent}` → `event: delta{text}…` → `event: done{full}` \| `event: error{error}` | §5 冻结事件名，补 `reply.final` 控制事件（对齐 ADR-017 两段式流式） |
| chat 载荷 | `{ intent, reply, entities:[{type,entity}], plan|null, performed:[...], userMessage, agentMessage }` | §5 定为 `ChatTurnResult`，前后端单一真相 |

> 结论：**「稳定」= 成功体裸形状 + 错误体 `error` 字符串 + 两条 SSE 事件名，四者逐字段冻结**。信封、分页、错误码、版本号都以「向后兼容的加法」引入。

---

## 1. 资源路由清单（按模块）+ schema 驱动 in/out

### 1.1 契约包物理落点（ADR-002 命名法）

```
packages/
  contracts-http/              # 唯一权威 API DTO（手写 Zod），前后端共享
    src/
      _envelope.ts             # 错误信封 / 分页 / 通用原语（Uuid/Timestamp/Cursor）
      _registry.ts             # extendZodWithOpenApi + 全局 registry（出 OpenAPI 组件）
      auth.contract.ts         # 每模块一个文件（= 一个路由前缀域）
      tasks.contract.ts
      ideas.contract.ts        nonTodos.contract.ts   projects.contract.ts
      chat.contract.ts         conversations.contract.ts
      collab.contract.ts       friends.contract.ts    notifications.contract.ts
      capture.contract.ts      plan.contract.ts        search.contract.ts
      ai.contract.ts           settings.contract.ts    agent.contract.ts
      team.contract.ts         data.contract.ts        state.contract.ts
      admin.contract.ts        health.contract.ts
      index.ts                 # 汇出 { <module>Contract } 命名空间
  contracts-events/            # SSE + 领域/集成事件 schema（§5 与事件总线共享）
    src/{ live.ts, chatStream.ts, integration.ts, index.ts }
```

**「一个模块一个 contract 文件」= 硬约束⑤在契约层的落地**：新增实体 → 新增 `<x>.contract.ts` + 在 `apps/api` 挂一条 `routePlugin`，零横向污染（对齐 ADR §8.4 五步纵切的第 4 步）。

### 1.2 每条路由的 in/out 契约描述子（RouteContract）

不散落 Zod，而是每端点声明为一个**结构化描述子**，路由注册与 OpenAPI 生成共用同一份：

```ts
// contracts-http/src/_registry.ts
import { z } from 'zod';
export interface RouteContract<
  P extends z.ZodTypeAny = z.ZodTypeAny,
  Q extends z.ZodTypeAny = z.ZodTypeAny,
  B extends z.ZodTypeAny = z.ZodTypeAny,
  R extends z.ZodTypeAny = z.ZodTypeAny,
> {
  method: 'GET'|'POST'|'PATCH'|'PUT'|'DELETE';
  path: `/api/${string}`;                 // 规范路径（v1 = 无段，见 §4）
  summary: string;
  tags: [string];                          // = 模块名，OpenAPI 分组
  auth: 'bearer' | 'none' | 'admin';
  params?: P; query?: Q; body?: B;
  reply: R;                                // 200/201 成功体（裸，不套信封）
  errors: ErrorCode[];                     // 可能抛出的错误码（进 OpenAPI responses）
  idempotent?: boolean;                    // 供 platform-idempotency / 重放
}
export const defineRoute = <P,Q,B,R>(c: RouteContract<P,Q,B,R>) => c;
```

### 1.3 资源路由清单（按模块，全量，对齐现网）

> `auth` 列：`B`=Bearer、`—`=公开、`A`=admin 门禁 403。`reply` 列写**裸成功体**类型（不含信封）。

**auth（`routes/auth.js`）**

| Method Path | in | reply |
|---|---|---|
| POST `/api/auth/register` | `{email,password,name?,accountName?}` | `{token, user:UserDto}` |
| POST `/api/auth/login` | `{email,password}` | `{token, user:UserDto}` |
| POST `/api/auth/logout` | — (B) | `{ok:true}` |
| GET `/api/auth/me` | (B) | `{user:UserDto}` |
| PATCH `/api/auth/me` | `{name?,accountName?}` (B) | `{user:UserDto}` |
| POST `/api/auth/password` | `{oldPassword,newPassword}` (B) | `{ok:true}`（吊销其它会话） |

**tasks（`routes/tasks.js`）**

| Method Path | in | reply |
|---|---|---|
| GET `/api/tasks` | `?view&scope&search&assignee&today` (B) | `TaskDto[]` |
| POST `/api/tasks` | `CreateTaskInput` (B) | `TaskDto` |
| GET `/api/tasks/:id` | `params{id}` (B) | `TaskDto` |
| GET `/api/tasks/:id/detail` | `params{id}` (B) | `TaskDetailDto`（子任务·评论·活动·生成记录） |
| PATCH `/api/tasks/:id` | `UpdateTaskInput` (B) | `TaskDto` |
| POST `/api/tasks/:id/done` \| `/reopen` \| `/move-out` | `params{id}` (B) | `TaskDto` / `{nonTodo:NonTodoDto}` |
| DELETE `/api/tasks/:id` | `params{id}` (B) | `{ok:true}` |
| POST `/api/tasks/:id/subtasks` · PATCH `/api/subtasks/:id` · DELETE `/api/subtasks/:id` | … (B) | `SubtaskDto` / `{ok:true}` |
| POST `/api/tasks/:id/comments` | `{text}` (B) | `CommentDto` |
| POST `/api/tasks/:id/invite` · `/leave` | `{name}` / — (B) | `CollaboratorDto` / `{ok:true}` |

**ideas / nonTodos / projects / capture / plan**

| Method Path | reply |
|---|---|
| GET `/api/todo-ideas` · POST `/:id/convert` · `/archive` · `/discard` | `TodoIdeaDto[]` / `TaskDto` / `{ok:true}` |
| GET `/api/non-todo-outputs` · POST `/:id/convert-to-todo` · `/discard` | `NonTodoDto[]` / `TaskDto` / `{ok:true}` |
| POST `/api/projects` | `ProjectDto` |
| POST `/api/capture` | `CaptureResultDto`（triage→落库+capture_records） |
| POST `/api/plan` · `/api/plan/commit` | `{block:PlanBlock}` / `{committed:TaskDto[]}` |

**chat / conversations（含 SSE，见 §5）**

| Method Path | in | reply |
|---|---|---|
| POST `/api/chat` | `{message, mentions?:Mention[], conversationId?}` (B) | `ChatTurnResult` |
| POST `/api/chat/stream` | 同上 (B) | **SSE**（§5.2） |
| GET `/api/conversations` | (B) | `{conversations:ConversationDto[]}` |
| POST `/api/conversations` | `{title?}` (B) | `ConversationDto` |
| GET `/api/conversations/:id/messages` | `?limit&cursor` (B) | `Paginated<ChatMessageDto>`（§2.2 新增分页） |
| PATCH `/api/conversations/:id` | `{title?, pinned?}` (B) | `ConversationDto` |
| DELETE `/api/conversations/:id` | (B) | `{ok:true}` |

**collab / friends / notifications**

| Method Path | reply |
|---|---|
| GET `/api/invites` · POST `/api/invites/:id/respond` | `{invites:InviteDto[]}` / `{invite:InviteDto}` |
| GET `/api/auto-rules` · DELETE `/api/auto-rules/:id` | `{rules:AutoRuleDto[]}` / `{ok:true}` |
| GET `/api/friends` | `FriendsOverviewDto` |
| POST `/api/friends/request` · `/:id/respond` · DELETE `/:id` | `{friendship:FriendshipDto}` / `{removed:true,…}` |
| GET `/api/notifications` · POST `/read-all` · `/:id/read` | `NotificationDto[]` / `{ok:true}` |

**settings / agent / ai / team / state / data / search / events / health / admin**

| Method Path | auth | reply |
|---|---|---|
| GET·PUT `/api/settings` | B | `AppSettingsDto` |
| GET·PUT `/api/agent` | B | `AgentProfileDto` |
| GET `/api/ai/config` · PUT `/api/ai/config` · PUT·DELETE `/api/ai/config/own` · POST `/api/ai/test` | B | `AiConfigDto` / `{ok:true,…}` |
| GET `/api/team` | B | `{members:MemberDto[]}` |
| GET `/api/state` | B | `AppStateDto`（全量首屏聚合） |
| GET `/api/export` · POST `/api/data/clear` | B | `ExportDto` / `{ok:true}` |
| GET `/api/search` · `/api/mentions` | B | `SearchResultDto` / `MentionSuggestionDto[]` |
| GET `/api/events` | B | **SSE**（§5.1） |
| GET `/api/health` | — | `{ok:true,ts}`（+ §拆 `/ready`，见可观测文档） |
| GET `/api/admin/overview` · `/api/admin/users/:id` | **A** | `AdminOverviewDto` / `AdminUserDto`（403 门禁） |

### 1.4 schema 驱动的 in/out 定义方式（Zod 4，不用 TypeBox）

选 **Zod 4** 而非 TypeBox：与前端共享（TypeBox 的 `Static<T>` 不便前端消费）、`z.infer` 直出 DTO 类型、`fastify-type-provider-zod` 让 body/query/params/reply 全程类型收窄。示例（tasks 模块）：

```ts
// contracts-http/src/tasks.contract.ts
import { z } from 'zod';
import { Uuid, Timestamp, ok } from './_envelope';
import { defineRoute } from './_registry';

export const Priority = z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)]);
export const TaskStatus = z.enum(['todo','in_progress','done','archived']);
export const Privacy = z.enum(['work','personal','mixed']);

export const TaskDto = z.object({
  id: Uuid, title: z.string(), status: TaskStatus, priority: Priority,
  privacy: Privacy, assignee: Uuid.nullable(), projectId: Uuid.nullable(),
  sourceIdeaId: Uuid.nullable(),
  dueAt: Timestamp.nullable(), plannedAt: Timestamp.nullable(),
  createdAt: Timestamp, updatedAt: Timestamp,
}).openapi('Task');                                   // 注册 OpenAPI 组件
export type TaskDto = z.infer<typeof TaskDto>;

export const CreateTaskInput = z.object({
  title: z.string().min(1).max(500),
  priority: Priority.default(3), privacy: Privacy.default('work'),
  projectId: Uuid.nullable().optional(), dueAt: Timestamp.nullable().optional(),
}).openapi('CreateTaskInput');

export const listTasks = defineRoute({
  method:'GET', path:'/api/tasks', tags:['tasks'], auth:'bearer',
  summary:'List tasks by view/scope/search',
  query: z.object({
    view: z.enum(['today','all','done','archived']).optional(),
    scope: z.enum(['mine','shared','all']).optional(),
    search: z.string().optional(), assignee: Uuid.optional(),
    today: z.coerce.boolean().optional(),
  }),
  reply: z.array(TaskDto),                             // 裸数组，形状冻结
  errors: ['UNAUTHORIZED'],
});
```

**为什么手写而非 drizzle-zod 派生**（复述 ADR C9 并给工程理由）：`TaskDto.assignee` 是 `Uuid`，但 DB row 可能是 `assignee_id` 蛇形、可能含 `user_id` 隔离列、`dueAt` 在库里是 timestamptz 而 DTO 要 ISO string——**API DTO 与 DB row 有意不同构**。派生会让 `contracts-http` 反向依赖 `infra-*` schema，破坏「contracts 仅依赖 kernel」的闸门。infra 内部用 drizzle-zod 校验 row 是私有实现细节。

---

## 2. 统一响应信封、分页、错误码

### 2.1 信封决策（关键取舍：成功不套、错误加法兼容）

> **被否方案 A：全局 `{data|error, meta}` 信封。** 会把现网所有裸成功体（`Task[]`、`{ok:true}`）改成 `{data:...}`，直接破坏前端 TS 模块，违反硬约束「API 契约稳定」。**否决。**
> **被否方案 B：错误体改为纯 `{error:{code,message}}` 嵌套对象。** 现网前端读 `body.error` 为**字符串**，嵌套会让其显示 `[object Object]`。**否决。**
> **选定方案 C：成功体裸传（逐端点冻结）+ 错误体「字符串兼容 + 类型化加法」。**

```ts
// contracts-http/src/_envelope.ts
// 成功：无信封。reply 直接是资源/裸数组/{ok:true}。（形状冻结）

// 错误：保留 error 为人类可读字符串（前端不改），旁加 code/requestId/details。
export const ErrorEnvelope = z.object({
  error: z.string(),                       // ← 冻结：前端现有读法不变
  code: z.enum(ERROR_CODES),               // ← 新增：程序判别
  requestId: z.string(),                   // ← 新增：贯穿日志（ADR-018）
  details: z.record(z.string(), z.unknown()).optional(),
}).openapi('Error');
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
```

服务端内部仍用 ADR-006 的 `AppError` 类，**序列化时降维**为上面的线格式：

```ts
// kernel-errors/src/AppError.ts
export class AppError extends Error {
  constructor(readonly code: ErrorCode, readonly httpStatus: number,
              message: string, readonly details?: Record<string,unknown>) { super(message); }
}
// apps/api/src/plugins/errorHandler.ts
app.setErrorHandler((err, req, reply) => {
  const e = err instanceof AppError ? err
    : mapKnown(err) ?? new AppError('INTERNAL', 500, '服务开小差了，请稍后再试');
  reply.status(e.httpStatus).send({
    error: e.message, code: e.code, requestId: req.id, details: e.details,
  });                                       // ZodError → 400 VALIDATION_FAILED（details 带字段路径）
});
```

### 2.2 分页（加法引入，keyset/cursor，ADR ④ 万人级）

现网列表端点（`/api/tasks`、`/api/notifications`）返回**全量裸数组**——万人级下会爆。策略：**旧端点保持裸数组不动（v1 冻结）；只对「可能无界增长」的集合上 keyset 分页，且优先用于新端点与 `conversations/:id/messages`**。

```ts
// contracts-http/src/_envelope.ts
export const Cursor = z.string().describe('opaque keyset cursor (base64 of createdAt+id)');
export const PageQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: Cursor.optional() });
export const Paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: Cursor.nullable() }).openapi(`Paginated`);
```

- **keyset 而非 offset**：`WHERE (created_at,id) < ($ts,$id) ORDER BY created_at DESC,id DESC LIMIT $n+1`，避免深翻页全表扫，与 UUIDv7 时间有序天然契合（ADR-007）。
- 迁移路径：`GET /api/tasks` 在 v1 继续裸数组；当单用户任务数触发阈值时，v2 版返回 `Paginated<TaskDto>`（§4 版本演进），前端按版本切换读法。

### 2.3 错误码注册表（单一真相 → OpenAPI + 前端 union）

```ts
// contracts-http/src/_envelope.ts
export const ERROR_CODES = [
  'UNAUTHORIZED','FORBIDDEN','ADMIN_ONLY',                 // 认证/门禁
  'VALIDATION_FAILED','NOT_FOUND','CONFLICT',              // 通用
  'RATE_LIMITED','IDEMPOTENCY_REPLAY',                     // 限流/幂等
  'FRIEND_REQUIRED','NOT_FRIENDS','STRANGER_BLOCKED',      // 好友圈收口
  'COLLAB_NOT_INVITED','COLLAB_ALREADY',                   // 协作三态
  'LLM_UNAVAILABLE','LLM_TIMEOUT','SSRF_BLOCKED',          // AI/安全
  'INTERNAL',
] as const;
export type ErrorCode = typeof ERROR_CODES[number];
```

| code | HTTP | 语义 / 触发点 | 现网映射 |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | 缺/失效 Bearer | `events.js` 401、preHandler |
| `FORBIDDEN`/`ADMIN_ONLY` | 403 | 非本人资源 / admin 门禁 | `admin.js` 403 |
| `VALIDATION_FAILED` | 400 | ZodError（`details` 带字段路径） | 取代满地 `if(!body.x)` P5 |
| `NOT_FOUND` | 404 | 资源不存在/跨用户不可见 | 取代 `{error:'not found'}` |
| `RATE_LIMITED` | 429 | 限流（`Retry-After` 头） | `chat.js` 429 串 |
| `FRIEND_REQUIRED`/`NOT_FRIENDS` | 403 | team·@·指派·邀请四处收口 | 好友圈单点真理 |
| `COLLAB_NOT_INVITED`/`_ALREADY` | 409 | 协作三态互斥 | settle 守卫 |
| `LLM_UNAVAILABLE`/`_TIMEOUT` | 503/504 | provider 熔断/超时（capture 仍落 idea 不丢） | `ai_errors` |
| `SSRF_BLOCKED` | 400 | baseUrl 私网段 | `platform-llm` 深检 |

**信封稳定性红线（§4 联动）**：`ERROR_CODES` 只增不删不改语义；HTTP 状态码不回退。新增 code 属向后兼容加法。

---

## 3. OpenAPI 生成 + 前端类型共享

### 3.1 服务端出 OpenAPI（`@fastify/swagger` + zod provider）

```ts
// apps/api/src/plugins/openapi.ts
import { serializerCompiler, validatorCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod';
import fastifySwagger from '@fastify/swagger';

export async function registerOpenapi(app: FastifyInstance) {
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);          // reply 也按 Zod 序列化/剥离多余字段
  await app.register(fastifySwagger, {
    openapi: { info: { title: 'LinX API', version: '1.0.0' },
      servers: [{ url: '/todo/api' }],                    // 对齐宿主 nginx /todo/api/ 反代前缀
      components: { securitySchemes: { bearer: { type:'http', scheme:'bearer' } } } },
    transform: jsonSchemaTransform,                       // Zod → JSON Schema
  });
  // 产物：GET /api/openapi.json（仅内网/admin 暴露），不装 swagger-ui 到生产
}
```

路由注册用 §1.2 的 `RouteContract`，一个 helper 把 contract 落成 Fastify 路由 + schema，**契约与实现零漂移**：

```ts
// apps/api/src/http/mountRoute.ts
export function mountRoute(app: FastifyInstance, c: RouteContract, handler: Handler) {
  app.route({
    method: c.method, url: rewriteVersion(c.path),        // §4 版本改写
    preHandler: c.auth === 'none' ? [] : [requireAuth(c.auth)],
    schema: { tags: c.tags, summary: c.summary,
      params: c.params, querystring: c.query, body: c.body,
      response: { [c.method==='POST'?201:200]: c.reply,
                  ...errorResponses(c.errors) },          // 把 errors[] 映成 4xx/5xx schema
      security: c.auth==='none' ? [] : [{ bearer: [] }] },
    handler,
  });
}
```

### 3.2 前端类型共享：双轨，`contracts-http` 为主、`openapi-typescript` 为回归护栏

| 方案 | 角色 | 理由 |
|---|---|---|
| **A. 直接 import `@linx/contracts-http`（选定为主）** | 前端 `import { TaskDto, CreateTaskInput } from '@linx/contracts-http'`，拿到 `z.infer` 类型**且**运行时 Zod（可在前端做乐观校验/表单校验） | monorepo 内 `workspace:*` 直连，DTO 是**同一份对象**，编译期即锁；避免 openapi→ts 的有损往返 |
| **B. `openapi-typescript` 生成 `api.d.ts`（选定为护栏）** | CI 用 `openapi-typescript openapi.json -o packages/contracts-http/src/__generated__/api.d.ts`，与手写 DTO 做**结构比对**（type-level `Equal<>` 断言） | 防止「手写 DTO 与真实序列化漂移」；纯类型、零运行时，作**回归门禁**不作消费入口 |

**对接已 TS 化前端的落地**（前端当前按模块 import 后端形状）：

```ts
// 前端 api client（示意）——类型来自 contracts，运行时可选校验
import { TaskDto, listTasks } from '@linx/contracts-http';
export async function getTasks(q: z.infer<typeof listTasks.query>): Promise<TaskDto[]> {
  const res = await http.get('/api/tasks', { params: q });
  return z.array(TaskDto).parse(res.data);   // 开发期开启，生产可关（信任后端 serializer）
}
```

- 前端若非同一 monorepo：`contracts-http` 以 `tsup` 出 `ESM + d.ts` 发私有 registry 或 `git subtree`；SSE 事件类型走 `contracts-events`（§5）。
- **CI 契约门禁（修 P12）**：`build openapi.json → openapi-typescript → type-diff → 失败即红`，与 `dependency-cruiser`/`vitest` 同级（ADR §5.4 三闸的契约维度）。

---

## 4. 版本化策略（`/api` vs `/api/v1`，平滑演进不破坏前端）

**选定：URL 前缀版本 + `/api` 永久别名到当前稳定版 + 加法优先、破坏性变更才 bump 版本。**

```
现网前端请求  /api/tasks
              │  nginx /todo/api/ → 127.0.0.1:8788（不改）
              ▼
apps/api 内部：/api/tasks  ──alias──►  /api/v1/tasks   （同一 handler，rewriteVersion）
新前端可显式：/api/v1/tasks
未来破坏性：  /api/v2/tasks           （v1 与 v2 并存一段迁移窗口）
```

| 规则 | 内容 |
|---|---|
| **别名** | `/api/*` == `/api/v1/*`（`mountRoute` 里 `rewriteVersion` 双注册），**现网前端一行不改** |
| **加法兼容（不 bump）** | 新增端点、reply 新增可选字段、请求新增可选参数、新增 error code、新增 SSE 事件类型 → 全在 v1 内做 |
| **破坏性（必 bump v2）** | 删/改字段语义、必填参数新增、成功体从裸数组改 `Paginated`、error `code` 语义变更 → 只在 `/api/v2` |
| **并存窗口** | v1 与 v2 同镜像同时在线；`contracts-http` 用 `v1/`、`v2/` 子目录隔离 DTO；OpenAPI 出两份 `servers` |
| **弃用协议** | 弃用端点回 `Deprecation` + `Sunset` 响应头 + `Warning`，日志打 `deprecated_route` metric，观测调用归零后再下线 |
| **契约冻结测试** | v1 的 OpenAPI 快照进 CI，任何破坏性 diff 触发红灯，逼迫改动落到 v2 |

> **被否：Header 版本（`Accept: application/vnd.linx.v2+json`）。** 对已用裸 URL 的前端不透明、CDN/nginx 缓存键复杂、调试不友好。URL 前缀最直白，契合单机 nginx 拓扑。

---

## 5. SSE 契约规范化（`events` / `chat.stream`）

两条流冻结事件名，类型收敛到 `contracts-events`，前后端共享同一 discriminated union（对齐 ADR-012 实时可丢 + ADR-017 两段式流式）。

### 5.1 `/api/events`（实时扇出，可丢，REST 兜底）

**帧格式冻结**：首帧 `event: hello / data:{"ok":true}`；心跳注释行 `: ping`（25s）；业务帧 `event: <kind> / data:<json，含 kind>`。`kind` 是判别式：

```ts
// contracts-events/src/live.ts
export const LiveEvent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('refresh') }),                                   // 兜底全量刷新
  z.object({ kind: z.literal('task'),   taskId: Uuid }),                      // 协作/关注任务变更
  z.object({ kind: z.literal('chat') }),                                      // 对方注入我的会话
  z.object({ kind: z.literal('friends') }),                                   // 好友关系变化
  z.object({ kind: z.literal('notify'), text: z.string(),
             actionType: z.string().nullable() }),                           // 内联通知
]).openapi('LiveEvent');
export type LiveEvent = z.infer<typeof LiveEvent>;
export const HelloFrame = z.object({ ok: z.literal(true) });
```

规范：① 无 sticky——`publishLive(userId)` 经 Redis 每副本收、仅持该 socket 的副本投递（保留 `events.js` 语义）；② 事件**不带业务全量**，客户端收到即走对应 REST 拉最新（可丢→重连拉全量兜底）；③ nginx 对 `/api/events` 必须 `proxy_buffering off; proxy_read_timeout 3600s;`（现网已发 `x-accel-buffering:no`，补 nginx 侧）；④ 新增事件类型 = 判别式加成员，属向后兼容（旧前端遇未知 kind 应默认当 `refresh`——写入前端契约约定）。

### 5.2 `/api/chat/stream`（逐字流，两段式）

**事件名冻结**：`status` → `delta`* → `done` | `error`。补一个**控制事件** `reply.final`（ADR-017：Guard strip 删除已流出文字时，前端以终态兜底）。规则模式无 `delta` 逐字，但 `status/done` 信封一致。

```ts
// contracts-events/src/chatStream.ts
export const ChatStreamEvent = z.discriminatedUnion('event', [
  z.object({ event: z.literal('status'), data: z.object({ intent: Intent }) }),
  z.object({ event: z.literal('delta'),  data: z.object({ text: z.string() }) }),
  z.object({ event: z.literal('reply.final'), data: z.object({ reply: z.string() }) }), // 权威终态（罕见 strip 覆盖）
  z.object({ event: z.literal('done'),   data: ChatTurnResult }),
  z.object({ event: z.literal('error'),  data: z.object({ error: z.string(), code: ErrorCode.optional() }) }),
]);

// done 载荷 = 单一真相（对齐 services/chat.js finish() 实测形状，前后端共享）
export const ChatTurnResult = z.object({
  intent: Intent,
  reply: z.string(),
  entities: z.array(z.object({ type: z.string(), entity: z.unknown() })),
  plan: PlanBlock.nullable(),
  performed: z.array(PerformedAction),      // {type:'complete_task'|'update_task'|'convert_idea'|'invite'|…, …}
  userMessage: ChatMessageDto,
  agentMessage: ChatMessageDto,
}).openapi('ChatTurnResult');
export const Intent = z.enum(['greeting','help','plan','query','complete','delete',
  'modify','remember','question','capture','identity','friend']);
```

规范：① `done.data` 与 `POST /api/chat`（非流式）返回体**同一 schema** `ChatTurnResult`——两条路径一个契约，消除双写漂移；② 传输头冻结 `text/event-stream; charset=utf-8` + `x-accel-buffering:no`（现网已具）；③ `performed[].type` 是闭集枚举，进 OpenAPI，新增动作 = 加枚举成员（兼容）；④ 错误统一走 `event:error`，`data.code` 复用 §2.3 错误码，前端可据 `LLM_TIMEOUT` 等做差异化提示。

### 5.3 SSE 在 OpenAPI 中的表达

`@fastify/swagger` 不原生描述 SSE。规范：SSE 端点在 OpenAPI 标 `text/event-stream` 的 `200`，并在 `description` 内联事件枚举 + `x-sse-events` 扩展字段引用 `contracts-events` 的 schema `$ref`；真正的类型安全由前端直接 import `LiveEvent`/`ChatStreamEvent` 保证（openapi-typescript 对流式无能为力，这里以 contracts 包为唯一真相）。

---

## 6. 落地检查单（与五北极星/硬约束回执）

| 项 | 满足方式 |
|---|---|
| ① 易扩展 | 新增实体 = 加 `<x>.contract.ts` + `mountRoute` 一条，横向零改 |
| ② 高并发 | keyset 分页（§2.2）避免深翻页全扫；serializer 剥字段减载荷 |
| ④ 水平扩展 | SSE 无 sticky（§5.1）、UUIDv7 游标、版本别名对 nginx 多副本透明 |
| ⑤ 细粒度包 | `contracts-http`（一模块一文件）+ `contracts-events` 独立，仅依赖 `kernel-*` |
| 契约稳定 | 成功体裸形状冻结、error 保 `error:string`、两条 SSE 事件名冻结（§0/§2.1/§5） |
| P5/P10/P12 修复 | Zod 校验取代手写 if；`AppError`+setErrorHandler 类型化信封；OpenAPI+CI 契约门禁 |

**关键发现（供上游决策留痕）**：现网响应是**裸 payload**、错误是**裸字符串**，因此上游「统一响应信封」若按字面理解为「成功也套 `{data}`」会破坏前端——本文将其收窄为「**成功不套、错误加法兼容**」，这是在硬约束「契约稳定」下唯一无损的解释，已写入 §2.1 作为对 ADR-006/#26 的落地细化。

（以上为完整交付物，未写入磁盘，按要求以文本返回。路径引用均对齐 `D:\workspace\project\todo\server\src\*` 实测结构。）
