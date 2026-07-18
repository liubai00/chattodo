> **AB3 起**:Button 全变体胶囊(rounded-full);Checkbox 为 17px 圆形勾选;Switch 为 iOS 制式(40×24、白 knob、`--switch-on`);SegmentedControl/TabPills 活动块 `--seg-active`+`--shadow-seg`;SearchField 胶囊 `--field-bg`。

# 组件分层 · Component Layers

前端组件按 **ui → base → business → views** 四层组织，依赖只能向下。目标是 "页面由组件名组成，不是 div+class 墙"。

## 层级与铁律

| 层 | 路径 | 职责 | 禁止 |
|----|------|------|------|
| ui | `components/ui/` | ShadCN 原子（reka-ui 封装），零业务语义 | 业务文案、Attio 变量耦合 |
| base | `components/base/` | 应用通用布局/模式，零 API、零 store | `import @/lib/api`、Pinia store |
| business | `components/business/` | 领域组件，props/emits 驱动 | 直接 fetch（`api.*`） |
| views | `app/views/` | 只组装 + 调 composables | 超过 2 层嵌套 div 而不抽组件 |

依赖方向：`views → business → base → ui`。base 不依赖 business；business 不直接调 API。

## 结构图

```
views/                 ← 组装层（薄）
  ├ FriendsView        useFriends + FriendAddForm + FriendListSection/FriendRow
  └ AgentView          useAgentConfig + TabPills + AgentSectionPanel/AutoRuleItem
business/              ← 领域组件（props/emits，不 fetch）
  FriendRow · FriendListSection · FriendAddForm
  AgentSectionPanel · AutoRuleItem
base/                  ← 通用布局（零 API/store）
  ViewHeader · PageBody · LoadingState · EmptyState
  ContentCard · SectionLabel · TabPills · ListRow
ui/                    ← ShadCN 原子
  button · input · label · switch · textarea · card
```

## base 组件职责

| 组件 | 职责 | 关键 props / slots |
|------|------|---------------------|
| ViewHeader | 57px 视图头栏（图标+标题+副标题+可选返回+trailing） | `icon`/`title`/`iconColor`/`iconSize`/`showBack`；slots: `leading`/`icon`/`default`/`trailing` |
| PageBody | 视图主内容滚动区（flex-1 + 响应式内边距） | `isMobile`；`class` 覆盖（如 `py-6`） |
| LoadingState | 加载占位（"加载中…"） | `text`；`class` 决定 `h-full`/`flex-1` |
| EmptyState | 空状态（图标+文案） | `icon`；default slot |
| ContentCard | Attio 面板（基于 ui/Card，统一圆角/边框/阴影/padding） | `class`（覆盖 flex/gap/padding） |
| SectionLabel | 小节标签（uppercase + tracking + text3） | `class`（如 `mb-0` 取消默认间距） |
| TabPills | 内容内标签栏（v-model 切换） | `items`/`modelValue`（泛型 `T extends string`） |
| ListRow | 通用列表行（leading/default/trailing） | `variant: solid \| dashed` |

## business 组件职责

| 组件 | 职责 |
|------|------|
| FriendRow | 好友行三态（incoming/outgoing/accepted），复用 ListRow；emit `accept`/`reject`/`withdraw`/`remove` |
| FriendListSection | 好友分组小节（SectionLabel + 列表 default slot + EmptyState） |
| FriendAddForm | 添加好友表单（邮箱输入+按钮）；`expose clear()` 供成功后清空 |
| AgentSectionPanel | Agent 分区面板（标题+描述+textarea+自动规则），复用 ContentCard/SectionLabel |
| AutoRuleItem | 自动规则项（展示 + emit `delete`） |

## composables

| composable | 职责 |
|------------|------|
| useRequest | 通用异步请求三态（`data`/`isLoading`/`error`/`execute`/`refresh`） |
| useAsyncLoad | useRequest 的 onMounted 薄封装（首屏拉取） |
| useFriends | 好友列表 `load`/`add`/`respond`/`remove`，`notify` 回调交回文案 |
| useAgentConfig | Agent 配置 `load`/`setValue`(即存)/`deleteRule` |

## 新增组件 checklist

新增 **base** 组件：
- [ ] props 有完整 TS 类型（`class?: HTMLAttributes['class']`）
- [ ] 用 `cn()` 合并 class，支持 caller 覆盖
- [ ] 支持 slots（leading/default/trailing 按需）
- [ ] **禁止** `import @/lib/api` 或任何 Pinia store

新增 **business** 组件：
- [ ] props/emits 类型完整，无 `any`
- [ ] 不直接 fetch（数据经 props 进、经 events 出）
- [ ] 复用 base 组件而非重写布局

新增 / 改造 **view**：
- [ ] 脚本 <80 行优先，模板无 inline `:style` 字符串拼接
- [ ] 数据/操作抽 composable，模板只组装组件
- [ ] 超过 2 层嵌套 div 抽成 business/base 组件

## 现状（P9 后）

- 已分层样板：FriendsView（55 行）、AgentView（41 行）。
- 横切应用：ViewHeader/LoadingState 覆盖全部标准头栏视图；PageBody/ContentCard/SectionLabel 应用到 Settings/Projects 等。
- 暂未深拆：ChatView（468 行）、DatabaseView（356 行）留待后续；TaskDetailView 头栏形态特殊未纳入 ViewHeader。
