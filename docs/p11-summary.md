# P11 收尾摘要

P11 是前端架构重构的收官阶段：把仅剩的厚视图（Chat/Database）与中等视图拆成「薄视图 + 域 composable + business 组件」，消灭 `@/lib/*` 兼容层，清零 `as any`，并补 ESLint + Prettier 工程守门。**行为完全不变**（路由 / API 契约 / SSE / chatStream / UI 交互逐一保留），仅做搬迁与拆分。

质量门禁（每个 commit）：`type-check` + `test(15)` + `build` + `lint` 全绿，无新增 `as any`。

## 各视图改前/改后行数

| 视图 | 改前 | 改后 | 说明 |
|------|------|------|------|
| ChatView | 478 | 70 | composable 门面 + 5 业务组件 |
| DatabaseView | 362 | 113 | useDatabaseBoard + BoardColumn/TaskCard |
| SettingsView | 211 | 42 | useSettings（已有）+ 6 section 组件（provide/inject） |
| ProjectsView | 201 | 92 | useProjects |
| TaskDetailView | 162 | 104 | useTaskDetail |
| NonTodoView | 160 | 69 | useNonTodo |
| ClarifyView | 133 | 69 | useClarify |
| AgentView | 41 | 41 | P9 已样板化，P11 未动 |
| FriendsView | 55 | 55 | P9 已样板化，P11 未动 |

所有视图 script 均 < 110 行，template 以组件标签为主。

## 新增 composables

| 域 | composable | 职责 |
|----|-----------|------|
| chat | `useChat`（门面）+ `useChatConversations` / `useChatMessages` / `useChatSend` / `useChatFeed` | 会话/消息流/发送流式编排/@提及/今日胶囊/feed；门面组合四子 composable，经 ChatCtx 共享 ref |
| tasks | `useDatabaseBoard` / `useProjects` / `useTaskDetail` | 看板表格+拖拽+FLIP / 项目列表+任务 / 详情面板全操作 |
| clarify | `useClarify` | 待澄清列表 + 转任务/放弃（乐观回滚） |
| nontodo | `useNonTodo` | 隔离区列表 + 转todo/复制/导出/归档/删除 |

另：`modules/chat/{types,utils}.ts`、`modules/tasks/types.ts` 提供强类型（RawMsg/TaskLite/FmtTask/BoardCol/ChatCtx 等），取代旧内联 `any` 接口。`useSettings` 增加 `SETTINGS_KEY`（InjectionKey）供 section 组件注入。

## 新增 business 组件

- **chat**：`ChatSidebar`（对话列表）、`ChatMessageList`（消息流）、`ChatComposer`（输入+@提及+发送）、`ChatFeedPanel`（收集箱）、`ChatTodayPill`（今日胶囊）
- **tasks**：`BoardColumn`（看板列）、`TaskCard`（看板卡片）
- **settings**：`SettingsAccount` / `SettingsGeneral` / `SettingsAi` / `SettingsNotifications` / `SettingsPrivacy` / `SettingsData`（6 section，经 provide/inject 注入 useSettings）

组件均为纯展示（props/emits，禁 fetch），动作经视图模型闭包或 emit 上抛。

## `as any` 剩余数量

**0**（目标 <5，最好 0 ✓）。P3-P11 累计清零全项目 `as any` / `: any` / `<any>`：

- ChatView 拆分消灭 ~30 处（chips/plan/conversations/team/refs 全强类型）
- DatabaseView/ProjectsView/TaskDetailView/ClarifyView/NonTodoView 拆分消灭各自 mapXxx(t:any) / (st as any)
- useSettings 清零 17 处（AppSettings/TestAiResult 强类型 + errMsg）
- AppShell 清零 6 处（searchResults/notifList/paletteGroups/catch）
- chat/api.ts 短路调用 `x && x.m()` 改可选链 `x?.m()`
- Notification 类型补 actionType/actionRef/handled/createdAt/color

ESLint `@typescript-eslint/no-explicit-any: error` 守门，新代码不得再引入。

## 删除的兼容层文件（13 个）

```
src/lib/{utils,format,keyboard,timeTokens,theme,aiPresets,api}.ts   # 7
src/composables/{useRequest,useAsyncLoad,useFriends,useAgentConfig}.ts  # 4
src/app/composables/usePane.ts                                       # 1
src/app/router.ts                                                    # 1
```

`lib/`、`composables/`、`app/composables/` 目录清空移除。`lib/api.ts` 聚合层删除后，`stores/{auth,ui,events}` + `app/AppShell.vue` + `admin/Admin.vue` 全部直引 `modules/*/api` + `infrastructure/request` 令牌，**无长期聚合例外**。

## 工程规范（P11-7）

- `eslint.config.ts`（flat）：`@eslint/js` + `typescript-eslint` + `vue3-recommended` + `eslint-config-prettier`
  - `no-explicit-any: error`；关闭 shadcn/camelCase 不适用规则（multi-word-component-names / attributes-order / attribute-hyphenation / require-default-prop / first-attribute-linebreak）
  - `no-undef: off`（.vue 经 vue-eslint-parser 包裹时误报 DOM 全局，交类型检查）
- `.prettierrc` + `.editorconfig`（2 空格 / 单引号 / 无分号）
- `package.json`：`lint` / `lint:check` / `format` / `prepare(husky)` 脚本
- `husky` + `lint-staged`：pre-commit 跑 `eslint --fix` 触达文件 + `type-check`
- CI 加 `Lint` 步骤 + eslint/prettier/editorconfig 路径触发
- 现状：`eslint src` 0 error / 0 warning

## 建议下一步

**架构重构收官，停止大重构。** 后续聚焦产品能力与验收：

1. **合并 main**：P11 分支（`claude/initial-frontend-prototype-tdru0i`）经桌面验收后合并，删除长名分支。
2. **桌面验收**：逐视图人工回归（聊天流式/拖拽看板/详情面板/设置/AI 接入/通知/搜索⌘K/快捷键），确认行为 parity。
3. **PRD 产品能力**：回到产品需求，补功能（非重构）。移动端布局（P3 第一版已铺全视图但 PAUSED，有 bug）待桌面收尾后集中修一轮。
4. **可选打磨**：`types/api.ts` 仍混放着跨域实体类型，后续可按域下沉到 `modules/<域>/types.ts`（非阻断）；`useFlip` 可考虑从 `motion/` 收敛到 `shared/composables/` 以严格对齐分层（当前作为已知例外记录在 architecture.md）。
