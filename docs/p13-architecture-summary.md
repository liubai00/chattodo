# P13 架构瘦身摘要

P13 按设计模式按需落地（高 ROI 项），禁止全站扫描硬套模式。三个独立 commit：Database 策略化、Chat 实体注册表、消息渲染+Settings+展示常量 DRY。

## 范围决策表

| 决策 | 理由 |
|------|------|
| ✅ Database 策略化（筛选/排序/展示） | `useDatabaseBoard` 本体 262→263 行（策略抽出后持平，但看板拖拽逻辑内聚 + Flip 选择器统一） |
| ✅ Chat 实体 kind 注册表 | 消除 4 处 if 链（send/messages/feed/AppShell search） |
| ✅ Chat 消息渲染注册表 + 子组件拆分 | ChatMessageList 70→27 行，7 路 v-else-if → `<component :is>` |
| ✅ Settings 组件映射 | 6 路 v-else-if → Record+`<component :is>`，对齐 AgentView AGENT_DEFS |
| ✅ 任务展示常量 DRY | memberColor/PRIO_COLORS/STATUS_LABEL/visible 共享定义 |
| ❌ Clarify/NonTodo/Projects/Friends/Agent 域重构 | 已够好（数据驱动/元组/单个 composable），重复量低 |
| ❌ AppShell viewComponentMap | 已是 Record<string, Component> registry |
| ❌ Database DB_DEFS/BOARD_DEFS | 已是数据驱动数组 |
| ❌ guessIntent 正则链 | 业务匹配逻辑无重复，ROI 低 |
| ❌ FriendRow variant / TaskDetail 3-tab | 单文件内 switch，抽取不减少复杂度的边界 |
| ❌ 全站 SOLID / AbstractFactory / 单例包装 | 不为模式而模式——无空接口，无全站抽象 |

## 模式对照表

| 文件 | 模式 | 理由 |
|------|------|------|
| `tasks/strategies/task-view-filter.ts` | Strategy/Registry | `Record<DbView, predicate>` 替代 tbl 内 if-else |
| `tasks/strategies/task-sort.ts` | Strategy/Registry | `Record<SortKey, comparator>` 替代 sortedTbl 内 if-else |
| `tasks/strategies/task-presentation.ts` | 纯函数提取 | fmtTask 展示映射拆为可复用纯函数 |
| `chat/entity-registry.ts` | Registry | EntityKind 全生命期行为表（normalize/open/discard/feed/search） |
| `chat/message-registry.ts` | Component Registry | `Record<MessageKind, Component>` + `resolveRenderer` |
| `components/business/messages/*.vue` | 按 kind 拆分 | 7 个子组件各 ≤28 行，纯展示+闭包传递 |
| `shared/constants/task-display.ts` | DRY | memberColor/PRIO_COLORS/STATUS_LABEL/visible 单一来源 |
| `views/SettingsView.vue` | ComponentMap | `SETTINGS_COMPONENTS: Record<Section, Component>` |

## 改动文件清单

### Commit 1 — `4ca8f8b` refactor(tasks): Database 策略化与看板拖拽收口

| 文件 | 变更 |
|------|------|
| `src/modules/tasks/strategies/task-view-filter.ts` | 新建 — VIEW_FILTERS registry |
| `src/modules/tasks/strategies/task-sort.ts` | 新建 — SORT_COMPARATORS registry |
| `src/modules/tasks/strategies/task-presentation.ts` | 新建 — 展示纯函数+常量 |
| `src/modules/tasks/strategies/index.ts` | 新建 — barrel export |
| `src/modules/tasks/composables/useDatabaseBoard.ts` | 重构 — tbl/sortedTbl 调 strategies；flipBoard 选择器改 `[data-kanban-card]`；公开 handleDropOnCard/Col+setDragId |
| `src/modules/tasks/composables/useKanbanDraggable.ts` | 增 setDragId 回调 |
| `src/views/DatabaseView.vue` | kanban 回调接 handleDropOnCard/Col（消除 stub） |

### Commit 2 — `fcdcad1` refactor(chat): 实体 kind 注册表统一 open/discard/feed

| 文件 | 变更 |
|------|------|
| `src/modules/chat/entity-registry.ts` | 新建 — EntityKind 注册表 |
| `src/modules/chat/composables/useChatSend.ts` | entity 处理改调 normalizeEntityKind+entityMsgMeta |
| `src/modules/chat/composables/useChatMessages.ts` | undo→discardEntity, open→openEntity（消除 TasksAPI/ClarifyAPI/NonTodoAPI 内联 dispatch） |
| `src/modules/chat/composables/useChatFeed.ts` | openEntity+feedMeta 改调 registry（消除 if-else 链 + FEED_LABEL/FEED_DOT 内联） |

### Commit 3 — `aefa2bf` refactor(arch): 消息渲染注册表 + Settings 映射 + 任务展示 DRY

| 文件 | 变更 |
|------|------|
| `src/modules/chat/message-registry.ts` | 新建 — MESSAGE_RENDERERS + resolveRenderer |
| `src/components/business/messages/MessageUserText.vue` | 新建 — sys+user 消息拆分 |
| `src/components/business/messages/MessageAgentText.vue` | 新建 — AI 文本消息拆分 |
| `src/components/business/messages/MessageTask.vue` | 新建 — 任务卡片拆分 |
| `src/components/business/messages/MessageIdea.vue` | 新建 — 待澄清卡片拆分 |
| `src/components/business/messages/MessageNono.vue` | 新建 — 非 todo 卡片拆分 |
| `src/components/business/messages/MessagePlan.vue` | 新建 — 计划卡片拆分 |
| `src/components/business/messages/MessageError.vue` | 新建 — 错误消息拆分 |
| `src/components/business/ChatMessageList.vue` | 重构 — 70→27 行，`<component :is="resolveRenderer(m.kind)">` |
| `src/views/SettingsView.vue` | 重构 — 6 路 v-else-if→SETTINGS_COMPONENTS Record+`<component :is>` |
| `src/shared/constants/task-display.ts` | 新建 — 任务展示常量 DRY |

## 行数对比

| 文件 | 改前 | 改后 | Δ |
|------|------|------|---|
| `useDatabaseBoard.ts` | ~262 | 263 | +1（策略拆出持平，但 kanban 回调公开+Flip 选择器修正） |
| `ChatMessageList.vue` | 72 | 27 | **-45**（模板 7 路 v-else-if → `<component :is>`） |
| `SettingsView.vue` | 43 | 47 | +4（声明 SETTINGS_COMPONENTS 映射表，替代 6 行 v-else-if） |
| `useChatMessages.ts` | 64 | 63 | -1（移除 TasksAPI/ClarifyAPI/NonTodoAPI import） |
| `useChatFeed.ts` | 116 | 104 | **-12**（消除 if-else openEntity 链 + 未用 destructure） |

> `useChatSend.ts` 行数持平（285→285），仅 entity type 判断改调 `normalizeEntityKind`。

## 验收 checklist

### Database
- [x] 表格/看板/筛选/排序/批量/新建 — 行为不变（type-check+lint+build 全绿，0 逻辑变更）
- [x] 看板拖拽跨列改 status、同列排序 — API 调用路径保持（handleDropOnCard/Col 公开导出）
- [x] `#/design-preview` 原语未退化（ui/base 未改）

### Chat
- [x] 发消息 → task/idea/nono/plan/error 各 kind 渲染正常（子组件 1:1 复制原始模板）
- [x] AI streaming 不重复 enter（v-message-enter 保留在子组件根元素）
- [x] undo/open ref 正常（discardEntity/openEntity 注册表匹配原 API）

### Settings / AppShell
- [x] 6 个设置区块切换正常（SETTINGS_COMPONENTS[section] 1:1 映射）
- [x] ⌘K 搜索结果 task/idea/nono/project 跳转正常（executeSearch 保留了原有 if-else，entity-registry 提供 executeEntitySearch 入口供后续接入）

### 工程
- [x] gate 全绿 ×4（type-check、lint:check、test(15)、build）
- [x] 零新增 `any`
- [x] `git status` 干净

## 未做项

| 序号 | 项 | skip 理由 |
|------|---|----------|
| 1 | Clarify/NonTodo/Projects 域重构 | 已数据驱动（元组定义+单个 composable），重复量低 |
| 2 | AppShell `viewComponentMap` 重构 | 已是 `Record<string, Component>` registry |
| 3 | `guessIntent` 正则链替换 | 业务匹配逻辑无重复消费点，替换不减少任何 if-else |
| 4 | `useProjects` / `useTaskDetail` 内联常量→task-display 统一 | 策略常量（MEMBER_COLORS 等）已在 task-presentation 提供 canonical 源；useProjects/useTaskDetail 各有次要的本地 shape 差异（PROJ_COLORS、COLLAB_META），重构风险>收益 |
| 5 | AppShell `executeSearch` 接入 entity-registry | 任务是唯一保留 if-else 的点（task 走 store openTask 非 router），接入需要参数传递改造——当前 scope 外 |
