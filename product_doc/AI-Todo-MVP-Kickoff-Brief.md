# AI Todo MVP Kickoff Brief

版本：v0.1  
用途：用于 MVP 定义、首次讨论与实现启动  
当前结论：第一版先做 CLI + Web，不做移动/桌面 App 成品

---

## 1. 一句话定位

做一个 **AI 原生的 todo 类想法收集与处理系统**。

用户可以把任何想法、备忘、句子、链接摘要、文章摘录丢进来，但主系统只服务 todo：判断哪些内容需要行动，把它们澄清、拆解、排期、推进执行。

非 todo 内容不进入主 todo 系统，只生成一个隔离输出，供用户复制、导出、归档或丢弃。

---

## 2. MVP 目标

第一版不是做完整效率工具，而是验证一个核心闭环：

```text
输入想法
  -> AI 判断是否 todo
  -> todo 进入主系统
  -> 澄清 / 拆解 / 排期
  -> 用户执行 / 完成 / 回顾

非 todo
  -> 生成隔离输出
  -> 不参与任务列表、计划、提醒、回顾
```

### 2.1 成功标准

两周内 demo 需要证明：

1. 用户能通过 CLI 快速输入 todo 类想法。
2. 用户能通过 Web 对话框输入 todo 类想法。
3. AI 能区分明确 todo、模糊 todo、非 todo。
4. 明确 todo 能进入任务数据库。
5. 模糊 todo 能进入 Todo Inbox，等待澄清。
6. 非 todo 能进入隔离输出区，不污染主系统。
7. 用户能问“接下来两小时做什么”，系统只基于主 todo 系统给计划。
8. 用户能编辑 agent 的 `soul`、`memory`、偏好和隐私规则。
9. 用户能切换工作/个人空间，并开启隐私模式。

---

## 3. 产品原则

### 3.1 Todo first

主系统只承载行动。

一个输入如果不能转化为行动、项目、下一步或待澄清事项，就不进入主系统。

### 3.2 AI 原生

AI 不是附加搜索框，而是主要交互方式：

- 用户用自然语言输入。
- 用户用自然语言查询。
- 设置页面也可以通过对话修改。
- AI 负责判断、澄清、拆解、推荐下一步。

### 3.3 信息只作为任务燃料

可以吸收备忘录、Cubox、稍后读、摘录类产品的能力，但不做知识库。

信息的目的不是沉淀，而是帮助用户决定：

- 要不要做？
- 下一步是什么？
- 什么时候做？
- 做完是否可以移出系统？

### 3.4 隔离非 todo

非 todo 内容必须与主 todo 系统隔离：

- 不进入任务列表。
- 不参与“接下来做什么”的计划。
- 不参与提醒。
- 不参与 GTD review。
- 不作为 AI 制定计划的上下文，除非用户明确引用。

### 3.5 先验证，不集成

第一版不做 Cubox、Obsidian、微信、飞书、Apple 备忘录等 API 兼容。

第一版只吸收这些产品的功能范式：

- 快速收集
- 摘录
- 摘要
- 稍后处理
- 从信息中提取行动项

---

## 4. 用户与核心场景

### 4.1 目标用户

第一版默认服务一个高频知识工作者：

- 每天有大量零散想法和任务。
- 同时处理工作与个人事务。
- 习惯用 AI、CLI、备忘录、文档工具。
- 需要减少 todo 和参考信息混在一起造成的噪音。

### 4.2 核心场景

#### 场景 A：快速收集任务

用户输入：

```text
下周三前把 AI todo app 的 MVP 文档提交评审
```

系统判断：

- 这是明确 todo。
- 创建 `Task`。
- 识别截止时间、标题、项目、优先级、隐私范围。

#### 场景 B：收集模糊 todo 想法

用户输入：

```text
周末研究一下 Cubox、OmniFocus、Todoist
```

系统判断：

- 这是 todo 类想法，但还不够具体。
- 进入 `TodoIdea`。
- AI 追问或建议下一步：明确研究目标、输出形式、比较维度。

#### 场景 C：输入非 todo 灵感

用户输入：

```text
AI todo app 可以借鉴 Cubox 的稍后读体验
```

系统判断：

- 这更像产品想法或参考信息。
- 进入 `NonTodoOutput`。
- 页面明确提示：未进入 todo 主系统。

#### 场景 D：询问下一步

用户输入：

```text
接下来两小时做什么？
```

系统行为：

- 只读取主 todo 系统。
- 排除 `NonTodoOutput`。
- 根据截止时间、优先级、上下文、预计时长给出 2 小时计划。

#### 场景 E：隐私模式

用户开启工作模式 + 隐私模式。

系统行为：

- 隐藏 personal todo。
- AI 计划只使用 work 范围数据。
- 非 todo 隔离输出也按隐私范围过滤展示。

---

## 5. MVP 范围

### 5.1 必须做

#### 客户端

- CLI
- Web

#### Web 模块

- 工作台
- 常驻聊天框
- Todo Inbox
- Todo 数据库
- NonTodo 隔离输出
- Agent 设置
- App 设置

#### CLI 能力

- 快速新增输入
- 查看今日任务
- 查看 Todo Inbox
- 询问下一步计划
- 标记任务完成
- 查看/修改 agent 信息

#### AI 能力

- `triage_input`
- `capture_input`
- `create_task`
- `update_task`
- `split_task`
- `plan_next_block`
- `get_agent_profile`
- `update_agent_profile`
- `get_app_settings`
- `update_app_settings`
- `list_non_todo_outputs`

### 5.2 暂不做

- 移动原生 App
- 桌面 App
- Cubox/Obsidian/微信/飞书 API 集成
- 浏览器插件
- 多 AI 厂商账号登录
- 多 agent 编排
- 完整端到端加密
- 多人协作权限
- 复杂通知系统
- 日历双向同步
- 知识库
- 稍后读完整替代品

---

## 6. 产品信息架构

### 6.1 Web 页面结构

#### 1. 工作台 Dashboard

用途：用户每天打开后看到当前状态。

展示：

- 今日任务数量
- Todo Inbox 数量
- 未完成任务数量
- NonTodo 隔离输出数量
- 推荐下一步行动
- 最近待澄清 todo

操作：

- 生成“接下来两小时计划”
- 跳转 Todo Inbox
- 标记任务完成
- 拆解任务

#### 2. 常驻聊天框 Chat Dock

用途：所有操作的自然语言入口。

要求：

- 在 Web 中始终可见。
- 可以输入任务。
- 可以输入非 todo 信息。
- 可以询问计划。
- 可以要求修改设置。

第一版重点支持：

```text
添加任务
判断输入
询问下一步
拆解任务
修改 agent 偏好
```

#### 3. Todo Inbox

用途：存放还没有完全澄清的 todo 类想法。

展示字段：

- 标题
- 原始输入
- AI 判断理由
- 建议下一步
- 隐私范围
- 来源
- 状态

操作：

- 转成任务
- 继续澄清
- 归档
- 丢弃

#### 4. Todo 数据库

用途：查看和管理正式任务。

视图：

- 全部
- 今日
- 未完成
- 已完成
- 按项目
- 按隐私范围

表格字段：

- 状态
- 标题
- 项目
- 标签
- 上下文
- 截止时间
- 计划时间
- 预计时长
- 优先级
- 隐私范围

操作：

- 完成
- 编辑
- 拆解
- 调整优先级
- 调整隐私范围

#### 5. NonTodo 隔离输出

用途：展示不进入 todo 主系统的内容。

展示字段：

- 标题
- 摘要
- AI 判断理由
- 建议去向
- 原始来源
- 隐私范围

操作：

- 复制
- 导出 Markdown
- 归档
- 删除
- 手动转成 todo

注意：手动转成 todo 必须由用户显式触发。

#### 6. Agent 设置

用途：管理 agent 行为。

字段：

- `soul`
- `memory`
- `preferences`
- `workingStyle`
- `privacyRules`
- `defaultFollowupStrategy`

#### 7. App 设置

用途：管理 app 本身。

字段：

- 当前空间：`work` / `personal`
- 隐私模式：开 / 关
- 默认视图
- AI 可见范围

---

## 7. 核心对象模型

### 7.1 TodoIdea

表示待澄清的 todo 类想法。

```ts
type TodoIdea = {
  id: string
  title: string
  rawText: string
  status: 'clarifying' | 'converted' | 'archived' | 'discarded'
  suggestedNextAction: string
  aiReason: string
  privacyScope: 'work' | 'personal' | 'mixed'
  source: 'cli' | 'web' | 'chat'
  createdAt: string
  updatedAt: string
}
```

### 7.2 Task

表示正式待办。

```ts
type Task = {
  id: string
  title: string
  notes: string
  status: 'todo' | 'in_progress' | 'done' | 'archived'
  projectId: string | null
  tags: string[]
  context: string
  dueAt: string | null
  plannedAt: string | null
  durationMinutes: number | null
  priority: 1 | 2 | 3 | 4
  privacyScope: 'work' | 'personal' | 'mixed'
  sourceIdeaId: string | null
  createdAt: string
  updatedAt: string
}
```

### 7.3 Project

表示多个任务组成的目标。

```ts
type Project = {
  id: string
  name: string
  description: string
  status: 'active' | 'paused' | 'done' | 'archived'
  privacyScope: 'work' | 'personal' | 'mixed'
  createdAt: string
  updatedAt: string
}
```

### 7.4 NonTodoOutput

表示非 todo 的隔离输出。

```ts
type NonTodoOutput = {
  id: string
  title: string
  summary: string
  rawText: string
  reason: string
  suggestedDestination: 'copy' | 'export' | 'archive' | 'discard'
  privacyScope: 'work' | 'personal' | 'mixed'
  source: 'cli' | 'web' | 'chat'
  createdAt: string
}
```

约束：

`NonTodoOutput` 默认不能被 `plan_next_block` 读取。

### 7.5 AgentProfile

```ts
type AgentProfile = {
  soul: string
  memory: string
  preferences: string
  workingStyle: string
  privacyRules: string
  defaultFollowupStrategy: string
  updatedAt: string
}
```

字段解释：

- `soul`：人格、原则、语气、决策倾向。
- `memory`：长期背景、固定项目、用户习惯。
- `preferences`：输出偏好、排序偏好、沟通偏好。
- `workingStyle`：GTD、OmniFocus、时间块等方法论偏好。
- `privacyRules`：哪些内容默认 work/personal，AI 什么情况下不能读取。
- `defaultFollowupStrategy`：任务不清楚时如何追问。

### 7.6 AppSettings

```ts
type AppSettings = {
  workspaceMode: 'work' | 'personal'
  privacyMode: boolean
  defaultView: 'dashboard' | 'inbox' | 'database'
  aiVisibility: 'visible_scope_only' | 'all_todo'
  updatedAt: string
}
```

---

## 8. AI 行为设计

### 8.1 输入分类

AI 对每次输入输出一个分类：

```ts
type TriageResult =
  | {
      kind: 'task'
      title: string
      reason: string
      confidence: number
      dueAt?: string | null
      plannedAt?: string | null
      durationMinutes?: number | null
      priority?: 1 | 2 | 3 | 4
      privacyScope: 'work' | 'personal' | 'mixed'
      tags: string[]
      context?: string
    }
  | {
      kind: 'todo_idea'
      title: string
      reason: string
      suggestedNextAction: string
      confidence: number
      privacyScope: 'work' | 'personal' | 'mixed'
    }
  | {
      kind: 'non_todo'
      title: string
      summary: string
      reason: string
      suggestedDestination: 'copy' | 'export' | 'archive' | 'discard'
      confidence: number
      privacyScope: 'work' | 'personal' | 'mixed'
    }
```

### 8.2 分类规则

明确 todo 的特征：

- 有行动动词：做、写、发、提交、整理、研究、联系、确认、预约。
- 有时间约束：今天、明天、周三、月底、下周。
- 有交付对象：提交 PRD、发送文档、整理评审材料。
- 有责任主体：默认用户自己要做。

模糊 todo 的特征：

- 有行动倾向，但缺目标。
- 有行动倾向，但缺下一步。
- 有行动倾向，但缺完成标准。

非 todo 的特征：

- 只是观点。
- 只是灵感。
- 只是摘录。
- 只是参考。
- 没有明确行动承诺。

### 8.3 计划生成规则

当用户问：

```text
接下来两小时做什么？
```

AI 只读取：

- `Task`
- 状态不是 done/archived
- 当前隐私模式允许可见

排序依据：

1. 截止时间近
2. 优先级高
3. 预计时长适合
4. plannedAt 已到
5. context 匹配当前场景

禁止读取：

- `NonTodoOutput`
- 被隐私模式隐藏的任务
- archived task

### 8.4 Agent Prompt 草案

```text
你是一个 todo-first 的 AI agent。

你的核心职责不是保存所有信息，而是帮助用户识别、澄清、拆解和推进 todo。

每次用户输入后，你必须先判断：
1. 这是明确 todo 吗？
2. 这是 todo 类想法但还需要澄清吗？
3. 这是非 todo 信息吗？

如果是明确 todo，创建 Task。
如果是模糊 todo，创建 TodoIdea，并提出一个最关键追问或建议下一步。
如果是非 todo，创建 NonTodoOutput，并说明它没有进入 todo 主系统。

制定计划时，只能使用 Task 和 TodoIdea 中已确认可执行的内容。
不能使用 NonTodoOutput 制定计划。

隐私模式开启时，只能读取当前 workspaceMode 允许的内容。

你的回复要简洁、行动导向、不要把参考信息伪装成任务。
```

---

## 9. API 设计

### 9.1 State

```http
GET /api/state
```

返回：

```ts
{
  agentProfile: AgentProfile
  appSettings: AppSettings
  projects: Project[]
  todoIdeas: TodoIdea[]
  tasks: Task[]
  nonTodoOutputs: NonTodoOutput[]
  visible: {
    todoIdeas: TodoIdea[]
    tasks: Task[]
    nonTodoOutputs: NonTodoOutput[]
  }
}
```

### 9.2 Capture

```http
POST /api/capture
```

请求：

```ts
{
  text: string
  source: 'web' | 'cli' | 'chat'
}
```

行为：

- 调用 `triage_input`
- 根据结果创建 `Task` / `TodoIdea` / `NonTodoOutput`

### 9.3 Chat

```http
POST /api/chat
```

请求：

```ts
{
  message: string
}
```

行为：

- 如果是计划问题，调用 `plan_next_block`
- 如果是输入内容，调用 `capture_input`
- 如果是设置修改，调用对应设置接口

### 9.4 Tasks

```http
GET /api/tasks
POST /api/tasks
PATCH /api/tasks/:id
POST /api/tasks/:id/split
POST /api/tasks/:id/done
```

### 9.5 Todo Ideas

```http
GET /api/todo-ideas
POST /api/todo-ideas/:id/convert
POST /api/todo-ideas/:id/archive
POST /api/todo-ideas/:id/discard
```

### 9.6 NonTodo Outputs

```http
GET /api/non-todo-outputs
POST /api/non-todo-outputs/:id/archive
POST /api/non-todo-outputs/:id/discard
POST /api/non-todo-outputs/:id/convert-to-todo
```

注意：

`convert-to-todo` 必须是用户手动触发。

### 9.7 Agent

```http
GET /api/agent
PUT /api/agent
```

### 9.8 App Settings

```http
GET /api/settings
PUT /api/settings
```

---

## 10. CLI 设计

命令名暂定为 `todo`。

### 10.1 新增输入

```bash
todo add "下周三前把 MVP 文档提交评审"
```

输出：

```text
已进入 todo 主系统：下周三前把 MVP 文档提交评审
id: task_xxx
```

或：

```text
已进入 Todo Inbox：周末研究 Cubox、OmniFocus、Todoist
next: 明确研究目标和输出形式
id: idea_xxx
```

或：

```text
非 todo，已隔离输出：AI todo app 可以借鉴 Cubox 的稍后读体验
reason: 更像产品想法或参考信息，缺少明确行动承诺
id: non_xxx
```

### 10.2 询问计划

```bash
todo ask "接下来两小时做什么"
```

输出：

```text
基于当前可见 todo，建议：
1. 完成 MVP 文档初稿（60 分钟）
2. 整理接口清单（30 分钟）
3. 提交评审并记录反馈（15 分钟）
```

### 10.3 查看任务

```bash
todo list today
todo list all
```

### 10.4 查看 Inbox

```bash
todo inbox
```

### 10.5 完成任务

```bash
todo done <task-id>
```

### 10.6 Agent 设置

```bash
todo agent get
todo agent get memory
todo agent set memory "用户正在验证 AI 原生 todo app"
todo agent set soul "冷静、主动、尊重用户注意力"
```

---

## 11. Web 客户端实现建议

### 11.1 技术选择

建议：

- React / Vue / Svelte 任一即可。
- 如果希望快速验证，建议 React + Vite。
- 样式可以先用原生 CSS 或 Tailwind。
- 第一版不引入复杂状态管理。

### 11.2 页面布局

桌面端推荐三栏：

```text
左侧导航
  工作台 / Inbox / 数据库 / 隔离 / Agent / 设置

中间主区域
  当前页面内容

右侧常驻聊天框
  输入、计划、澄清、设置修改
```

移动端暂不作为 MVP 重点，但 Web 需要响应式可用。

### 11.3 视觉方向

关键词：

- 极简
- 类 Notion，但避免工具栏拥挤
- 内容优先
- todo 与 non-todo 有明显视觉隔离

重要 UI 区分：

- Todo 主系统：绿色/蓝色等稳定色
- NonTodo 隔离区：灰色/琥珀色提示，不要像任务
- 隐私模式：顶部明确状态

### 11.4 Web 客户端任务拆分

Web 客户端第一阶段：

1. 搭建页面框架和导航。
2. 实现工作台。
3. 实现右侧常驻聊天框。
4. 实现 Todo Inbox。
5. 实现 Todo 数据库表格。
6. 实现 NonTodo 隔离输出。
7. 实现 Agent 设置表单。
8. 实现 App 设置表单。
9. 接入 API。
10. 做基础响应式。

---

## 12. 服务端实现建议

### 12.1 技术选择

第一版建议：

- Node.js + Express / Fastify
- SQLite / Postgres
- Prisma / Drizzle 可选

如果想极快验证：

- 本地 JSON store 也可以，但只适合 demo。

推荐正式 MVP：

- SQLite 起步，后续迁移 Postgres。

### 12.2 服务端模块

```text
api/
  capture
  chat
  tasks
  todoIdeas
  nonTodoOutputs
  agent
  settings

services/
  triageService
  taskService
  planningService
  privacyService
  agentProfileService

storage/
  schema
  repository
```

### 12.3 服务端任务拆分

服务端第一阶段：

1. 定义数据库 schema。
2. 实现基础 CRUD。
3. 实现 `triage_input`。
4. 实现 `capture_input`。
5. 实现 `plan_next_block`。
6. 实现隐私过滤。
7. 实现 agent/app settings。
8. 实现 CLI 调用 API。
9. 写基础测试。

---

## 13. 数据库表建议

### 13.1 tasks

| 字段 | 类型 |
|---|---|
| id | text pk |
| title | text |
| notes | text |
| status | text |
| project_id | text nullable |
| tags | json |
| context | text |
| due_at | datetime nullable |
| planned_at | datetime nullable |
| duration_minutes | integer nullable |
| priority | integer |
| privacy_scope | text |
| source_idea_id | text nullable |
| created_at | datetime |
| updated_at | datetime |

### 13.2 todo_ideas

| 字段 | 类型 |
|---|---|
| id | text pk |
| title | text |
| raw_text | text |
| status | text |
| suggested_next_action | text |
| ai_reason | text |
| privacy_scope | text |
| source | text |
| created_at | datetime |
| updated_at | datetime |

### 13.3 non_todo_outputs

| 字段 | 类型 |
|---|---|
| id | text pk |
| title | text |
| summary | text |
| raw_text | text |
| reason | text |
| suggested_destination | text |
| privacy_scope | text |
| source | text |
| created_at | datetime |

### 13.4 agent_profiles

| 字段 | 类型 |
|---|---|
| id | text pk |
| soul | text |
| memory | text |
| preferences | text |
| working_style | text |
| privacy_rules | text |
| default_followup_strategy | text |
| updated_at | datetime |

### 13.5 app_settings

| 字段 | 类型 |
|---|---|
| id | text pk |
| workspace_mode | text |
| privacy_mode | boolean |
| default_view | text |
| ai_visibility | text |
| updated_at | datetime |

---

## 14. 隐私设计

### 14.1 MVP 能力

第一版只做产品级隐私隔离，不承诺完整端到端加密。

必须支持：

- `privacyScope = work | personal | mixed`
- `workspaceMode = work | personal`
- `privacyMode = true | false`

隐私模式开启时：

- work 模式只展示 work / mixed。
- personal 模式只展示 personal / mixed。
- AI 计划只读取当前可见内容。

### 14.2 后续技术评审

完整 E2EE 需要单独评估：

- 云端 AI 推理如何处理加密内容？
- 是否支持本地模型？
- 是否只加密静态存储？
- 搜索和计划是否可用？
- 多端同步如何处理密钥？

---

## 15. LLM 接入策略

### 15.1 第一版

第一版可以先用 mock / rule-based triage 跑通产品闭环。

原因：

- 先验证数据流和交互。
- 避免 API key、模型选择、成本、延迟影响讨论。
- 后续替换成真实 LLM provider。

### 15.2 Provider 抽象

服务层预留：

```ts
interface AiProvider {
  triageInput(input: string, context: AgentContext): Promise<TriageResult>
  splitTask(task: Task, context: AgentContext): Promise<TaskDraft[]>
  planNextBlock(tasks: Task[], context: AgentContext): Promise<PlanResult>
}
```

第一版 provider：

- `LocalRuleProvider`

后续 provider：

- OpenAI
- Claude
- Gemini
- 通义 / 豆包 / DeepSeek 等

---

## 16. 验收用例

### 16.1 Todo 输入

输入：

```text
下周三前把 AI todo app 的 MVP 文档提交评审
```

期望：

- 创建 `Task`
- 标题正确
- 截止时间被识别
- 隐私范围默认 work

### 16.2 模糊 Todo

输入：

```text
周末研究一下 Cubox、OmniFocus、Todoist
```

期望：

- 创建 `TodoIdea`
- 状态为 `clarifying`
- 有 `suggestedNextAction`

### 16.3 非 Todo

输入：

```text
AI todo app 可以借鉴 Cubox 的稍后读体验
```

期望：

- 创建 `NonTodoOutput`
- 不创建 Task
- 不进入 Todo Inbox

### 16.4 计划

输入：

```text
接下来两小时做什么？
```

期望：

- 返回 1-4 个任务
- 不使用 `NonTodoOutput`
- 不使用隐私模式隐藏的任务

### 16.5 隐私模式

条件：

- 有一条 work task
- 有一条 personal task
- workspaceMode = work
- privacyMode = true

期望：

- 页面只展示 work task
- AI 计划只使用 work task

### 16.6 Agent 设置

操作：

修改 `memory`：

```text
用户偏好每天上午处理深度工作
```

期望：

- 保存成功
- 后续计划生成可以读取该偏好

---

## 17. 两周开发计划

### Week 1

目标：跑通数据流和主页面。

服务端工作：

- 定义 schema
- 实现基础 API
- 实现本地 AI triage
- 实现 capture 和 plan
- 实现 CLI 最小命令

Web 客户端工作：

- 搭建 Web 项目
- 实现布局
- 实现 Dashboard
- 实现 Chat Dock
- 实现 Todo Inbox
- 接入 state API

产品定义工作：

- 补充 20 条真实输入样本
- 标注 todo / todo idea / non-todo
- 根据样本调整 triage 规则

### Week 2

目标：完成可演示闭环。

服务端工作：

- 实现任务编辑、完成、拆解
- 实现 agent/settings API
- 实现隐私过滤
- 补测试

Web 客户端工作：

- 实现 Todo 数据库
- 实现 NonTodo 隔离区
- 实现 Agent 设置
- 实现 App 设置
- 做基础响应式

产品定义工作：

- 验收 10 个核心场景
- 准备 demo script
- 决定下一阶段是否做真实 LLM 接入

---

## 18. 工作流拆分建议

### 产品定义

- 提供真实输入样本。
- 定义 triage 判断标准。
- 验收 todo / non-todo 边界。
- 决定 Web 信息架构。
- 设计 demo script。

### 服务端实现

- 数据模型
- API
- AI provider 抽象
- triage / planning 服务
- CLI
- 隐私过滤
- 测试

### Web 客户端实现

- 页面框架
- 常驻聊天框
- Dashboard
- Todo Inbox
- Todo 数据库
- NonTodo 隔离输出
- Agent/App 设置
- 交互状态

---

## 19. 第一次讨论议程

建议 60-90 分钟。

### 议题 1：产品边界

确认：

- 主系统是否只服务 todo？
- 非 todo 是否只做隔离输出？
- 第一版是否不做任何外部 API 集成？

### 议题 2：MVP 客户端

确认：

- 第一版只做 CLI + Web。
- App 暂缓，但接口复用。

### 议题 3：AI 判断标准

讨论：

- 什么算明确 todo？
- 什么算模糊 todo？
- 什么算 non-todo？
- 用户能不能手动纠正分类？

### 议题 4：数据模型

确认：

- `TodoIdea`
- `Task`
- `NonTodoOutput`
- `AgentProfile`
- `AppSettings`

### 议题 5：技术方案

确认：

- 技术栈
- 存储
- API 风格
- CLI 调用方式
- 是否第一版先 rule-based，后续再接 LLM

### 议题 6：两周 demo

确认：

- demo 要展示哪些路径？
- 各模块的 owner 和交付顺序是什么？
- 每 2-3 天如何同步？

---

## 20. 仍需决策的问题

如果首次讨论没有异议，可以按本文默认方案进入实现。以下问题可以在首次讨论时快速确认：

1. 第一版是否使用 SQLite，还是先用 JSON store？
2. Web 技术栈选 React 还是 Vue？
3. CLI 是否直接调用本地 API，还是共享服务层代码？
4. `NonTodoOutput` 是否需要保留历史？
5. Agent `memory` 第一版是否只做手动编辑？
6. 任务是否需要 `plannedAt`，还是只保留 `dueAt`？
7. 是否要在 MVP 中支持手动纠正 AI 分类？
8. 真实 LLM 接入放在 MVP 内还是 MVP 后？

---

## 21. 推荐默认决策

如果想最快进入实现，建议默认：

- 技术栈：React + Vite + Node.js + SQLite
- AI：第一版 rule-based + provider 抽象
- CLI：调用同一套服务层
- Web：三栏布局
- 数据：先单用户
- 隐私：work/personal scope + privacy mode
- NonTodo：保存历史，但不进入计划
- App：第二阶段再做

---

## 22. Demo Script

演示顺序：

1. 打开 Web 工作台。
2. 在 CLI 输入：

```bash
todo add "下周三前把 MVP 文档提交评审"
```

3. Web 刷新后看到任务进入数据库。
4. 在 Web 聊天框输入：

```text
周末研究一下 Cubox、OmniFocus、Todoist
```

5. 看到内容进入 Todo Inbox。
6. 在 Web 聊天框输入：

```text
AI todo app 可以借鉴 Cubox 的稍后读体验
```

7. 看到内容进入 NonTodo 隔离输出。
8. 问：

```text
接下来两小时做什么？
```

9. 系统只基于 todo 输出计划。
10. 打开 Agent 设置，修改 memory。
11. 打开隐私模式，确认 personal 内容隐藏。

---

## 23. 最小可交付清单

### 服务端完成

- [ ] 数据库 schema
- [ ] `GET /api/state`
- [ ] `POST /api/capture`
- [ ] `POST /api/chat`
- [ ] task CRUD
- [ ] todo idea convert/archive
- [ ] non todo list/archive/discard
- [ ] agent settings
- [ ] app settings
- [ ] privacy filter
- [ ] CLI
- [ ] 基础测试

### Web 客户端完成

- [ ] Web layout
- [ ] Dashboard
- [ ] Chat Dock
- [ ] Todo Inbox
- [ ] Todo Database
- [ ] NonTodo Output
- [ ] Agent Settings
- [ ] App Settings
- [ ] 隐私模式 UI
- [ ] 基础响应式

### 产品定义完成

- [ ] 输入样本集
- [ ] 分类标准
- [ ] Demo script
- [ ] 验收用例
- [ ] 第二阶段假设

---

## 24. 第二阶段方向

MVP 验证后再考虑：

- 移动 App
- 浏览器插件
- Obsidian Markdown 导入/导出
- Cubox 类稍后读体验增强
- 飞书/微信输入入口
- 日历集成
- 真实 LLM provider
- 多 AI 厂商
- 本地模型
- 完整 E2EE
- 多 agent

---

## 25. 结论

第一版要守住一个核心：

**这不是信息管理系统，而是 todo 类想法处理器。**

信息可以进来，但只有行动能留在主系统里。AI 的价值不是帮用户囤积更多内容，而是帮用户判断、澄清、拆解、安排和移除。

如果首次讨论同意这个边界，可以直接按本文拆分模块并进入实现。
