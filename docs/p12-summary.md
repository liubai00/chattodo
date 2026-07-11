# P12 Attio 设计系统 + Database 样板页 — 收尾摘要

P12 从前端架构重构（P3–P11）转入视觉与动效系统化，以 Attio 的审美目标（中性灰阶 + 紫 accent、hairline border、圆角统一、丝滑过渡、双主题同等打磨）在现有技术栈上落地设计系统。

## 七次 commit 概览

| commit | 内容 | 文件数 | 核心产出 |
|--------|------|--------|----------|
| `361aa2a` | P12-1: 设计系统基建 | 28 file | 修 components.json aliases；`docs/design-system.md`；`shared/constants/motion.ts`；`#lx-root` 作用域 preflight；ui 层 7 族组件（select/popover/separator/badge/dropdown-menu/tooltip/skeleton） |
| `b423401` | P12-2: base 层通用组件 | 8 file | FilterSelect/SearchField/SegmentedControl/NavItem/IconButton/SurfacePanel/Checkbox + `base/index.ts` barrel |
| `96327f9` | P12-3: Database 样板页 | 3 file | 抽 `business/DatabaseTable.vue`（grid scoped CSS 消内联墙）；侧栏/移动 chips → NavItem；切换 → SegmentedControl；select → FilterSelect；Vue Transition 视图切换 + 批量栏 |
| `36f31fd` | P12-4: Settings select 替换 | 2 file | SettingsGeneral ×1 + SettingsAi ×2 原生 `<select>` → FilterSelect |
| `12bb7a7` | P12-5: AppShell + 登录 | 2 file | 登录屏 Card/Input/Button + v-fade；Rail NAV 项 Tooltip(400ms) + active class；IconButton 替换功能钮；面板 Popover 风格统一 |
| `9d63d24` | P12-6: 动效门禁 + dark | 6 file | `useMotion` composable；base 组件全部接入；docs/design-system.md 补暗色验收 checklist |
| *(本次)* | P12-7: 收尾摘要 | 文档 | 本文件 + MEMORY 更新 |

## 组件清单

### ui 层（新增 7 族，全部 reka-ui + Phosphor + cn）

select（Trigger/Content/Item/Label/Separator/ScrollUp/Down）、popover（Content）、separator、badge（6 变体）、dropdown-menu（Content/Item/Label/Separator/Shortcut）、tooltip（Content）、skeleton

### base 层（新增 7 个，含 barrel index.ts）

FilterSelect、SearchField、SegmentedControl、NavItem、IconButton、SurfacePanel、Checkbox

> base 层组件全部通过 `useMotion().transitionColors` 接入 reduced-motion 动效门禁（CSS 层 `@media (prefers-reduced-motion: reduce)` + JS/composition 层双层防线）。

### business 层（新增 1 个）

DatabaseTable（grid scoped CSS，行/表头/空态，FmtTask 闭包模型）

## 验收指标

| 指标 | 状态 |
|------|------|
| 原生 `<select>` count | **0**（src/ 下仅 FilterSelect.vue 注释含 `<select>`） |
| new `any` | **0**（全链路 type-check + lint `no-explicit-any: error` 无违例） |
| inline `:style` 拼接 >80 字符（views/DatabaseView.vue template） | **0**（仅剩 `:style="{ width: dbNavW + 'px', flex: '0 0 ' + dbNavW + 'px' }"` 对象绑定，约 50 字符） |
| inline `:style` 拼接 >80 字符（app/AppShell.vue template） | **0**（全部 class + short binding） |
| `:style` 内联模板字符串（backtick + `${}`）| DatabaseView 0、DatabaseTable 0、AppShell 0（rail/登录均 class 化） |
| type-check | ✅ |
| test (15) | ✅ |
| lint:check | ✅ |
| build | ✅ |
| 每 commit 质量门禁 | ✅（husky → type-check 在每个 commit 上均通过） |
| 服务器 / 强制推送 / 合并到主干 | 未触及 |

## 范围外（P13 及以后）

- 面向全局的 SOLID/策略/工厂模式重构（应移至 P13）
- 跨视图（projects/clarify/nontodo/agent/friends）的整体改造 —— 这些视图能从基础组件中获益，但不在本轮样板页范围内
- 对处于 useDatabaseBoard composable 底层的 fmtTask 进行内联 style 消除（渲染模型将样式字符串预计算完成，交由 base/Checkbox 消费）

## 推测的后续步骤

1. 将 `claude/initial-frontend-prototype-tdru0i` 合并到 `main`（PR + 桌面端验收）
2. 在未完成的移动端 bug 上恢复工作（最后一个已知状态：视图已布局，但存在 bug；参见 memory `frontend-rewrite` 中关于"先做 web 端"的用户备注）
3. P13：SOLID/设计模式重构（如果已排入计划）
4. PRD 产品级打磨（根据用户意愿）
