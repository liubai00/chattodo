# P13 动效重构摘要 — Attio/Notion 全站微交互落地

日期：2026-07-11
分支：claude/initial-frontend-prototype-tdru0i
Commits：3 个（全 green gate）

## 改了什么

### Commit 1：e038a5a — 全局 token + motion utility class 重构
- `src/styles/tokens.css`：MD §3 全局动效 Token
  - `--duration-immediate/standard/functional` (120/200/300ms) 主令牌体系
  - `--delay-short:75ms` / `--delay-medium:150ms`
  - `--ease-exit` 修正为 `cubic-bezier(0.4,0,0.6,1)`（MD 标准）
  - `--ease-overlay-out` 统一为 `var(--ease-exit)`
  - 旧别名零破坏：`--duration-fast/medium/slow` → `var()` 引用
- `src/styles/motion.css`：MD §4+§5 工具类体系
  - `.lx-overlay` keyframes **scale(0.95)→translateY(-4px)**（MD §4.1.4 Dropdown/Select/Popover）
  - `.lx-tooltip` translateY(-2px) 保留，exit 改用 MD ease-exit
  - `.lx-press` scale(0.97) 120ms（保留）
  - **新增** `.lx-btn-interact`：hover:scale(1.02) + active:scale(0.97) + 200ms→120ms duration 切换（MD §4.1.2）
  - **新增** `.lx-card-interact`：hover:translateY(-4px) + shadow-md（MD §4.1.3）
- `docs/design-system.md`：动效令牌表 + utility class 表同步更新

### Commit 2：a57f690 — ui 层组件全改（5 组件）
| 组件 | 改动 | MD |
|------|------|-----|
| Button | `lx-press`+手动transition→`lx-btn-interact` | §4.1.2 |
| Card | +`lx-card-interact` | §4.1.3 |
| SelectItem | +`transition-colors duration-[150ms]` | §4.2.3 |
| Switch | Root+Thumb 补 `duration-[var(--duration-standard)] ease-[var(--ease-neutral)]` | §4.2.5 |
| Label | +`peer-focus:text-[var(--accent)] transition-colors` | §4.2.2 |

**自动生效**：DropdownMenu/Popover/SelectContent overlay 从 motion.css keyframes 改写继承。

**已对齐无需改**：Input/Textarea/SelectTrigger/Badge/Skeleton/Separator — 提交前便有正确的 transition 逻辑。

### Commit 3：cc02643 — base 层去重 + business/views/AppShell + 路由动效
- **base 层**：TabPills +`useMotion().transitionColors`（对标 SegmentedControl）；其余 14 个委托 ui 或静态无需改
- **business**：DatabaseTable 已有 scoped `transition: background-color` row hover（MD §6.1）✓
- **views/AppShell**：
  - `styles.css` lx-pop keyframe 净化：去 blur+overshoot scale → 纯 `translateY(8px)+opacity`（MD §6.3）
  - rail/登录 Card/Input 沿用 ui 层改完成果
  - 通知/toast/搜索/快捷键 modal 通过 lx-pop 自动升级
- **路由动效**：`easings.ts` DURATION_ROUTE 280→300ms 纯 opacity（MD §5.1）；SCALE_POP→SCALE_HOVER=1.02

## MD 每条规范对应的实现位置

| MD 章节 | 规范 | 实现位置 |
|---------|------|---------|
| §3 全局 Token | duration 120/200/300 + delay + cubic-bezier | `tokens.css` L131-165 |
| §4.1.1 Badge | 静态，无交互 | `badge/index.ts` transition-colors ✓ |
| §4.1.2 Button | hover:1.02 + active:0.97 + 200/120ms | `motion.css` .lx-btn-interact + `ui/button/index.ts` |
| §4.1.3 Card | hover:-4px + shadow-md | `motion.css` .lx-card-interact + `ui/card/Card.vue` |
| §4.1.4 Dropdown | translateY(-4px) + opacity 200ms | `motion.css` .lx-overlay keyframes |
| §4.2.1 Input | focus ring 200ms border+shadow | `ui/input/Input.vue` ✓（提交前已有） |
| §4.2.2 Label | peer-focus 颜色过渡 | `ui/label/Label.vue` |
| §4.2.3 Select | Trigger=Input, Content=Dropdown | `ui/select/*` 委托 overlay+SelectTrigger 已有 |
| §4.2.4 Textarea | 同 Input | `ui/textarea/Textarea.vue` ✓ |
| §4.2.5 Switch | 200ms 背景+thumb translate | `ui/switch/Switch.vue` |
| §4.3.1 Popover | 同 Dropdown translateY(-4px) | `motion.css` .lx-overlay |
| §4.3.2 Tooltip | 150ms + translateY(-2px) | `motion.css` .lx-tooltip |
| §4.3.3 Skeleton | animate-pulse | `ui/skeleton/Skeleton.vue` ✓ |
| §4.3.4 Separator | 静态 | `ui/separator/Separator.vue` ✓ |
| §5.1 页面转场 | 300ms 纯 opacity | `motion/easings.ts` DURATION_ROUTE=0.3 |
| §5.2 全局过渡 | transition-standard/functional class | `motion.css` .lx-btn-interact/.lx-card-interact |
| §6.1 表格行 | transition-colors 200ms hover | `business/DatabaseTable.vue` scoped `.db-row` |
| §6.2 工具栏 | Button+Select 组合一致 | `views/DatabaseView.vue` 委托 ui/base ✓ |
| §6.3 通知/toast | translateY + opacity | `styles.css` lx-pop keyframe 净化 |

## 与 MD 原文的技术栈差异

| MD 原文 | 本项目实际 |
|---------|-----------|
| `tailwind.config.js` theme.extend | `tokens.css` CSS 变量 + `tailwind.css` `@theme inline` |
| React JSX / `className=` | Vue SFC / `:class="cn(...)"` |
| Framer Motion / `motion.div` | GSAP `routeTransition.ts` + Vue `<Transition>` |
| `ring-blue-500/20` | `ring-[var(--accent)]/20`（项目紫色调） |
| `data-[state=open]` (Radix) | `data-[state=open]` (reka-ui，同款属性) |
| `/* globals.css */` tailwind 工具类 | `motion.css` `@layer utilities` CSS @keyframes |
| 页转场 `<AnimatePresence mode="wait">` | Vue `<Transition>`（App.vue）+ GSAP `onRouteEnter/Leave` |

## 已知未覆盖项

1. **移动端动效** — Phase 9 mobile PAUSED 有 bug，按用户 2026-07-10 决策不在此次重构范围
2. **ChatView 内部微交互** — ChatFeedPanel/ChatComposer/ChatMessageList 消息动画 → P14 候选
3. **Tooltip delayDuration** — reka-ui TooltipProvider 已支持 `delay-duration` prop，AppShell 设 400ms；MD 要求的 150ms delay 未在组件级统一，留给 TooltipProvider 默认值

## 验收状态

- [x] `#/design-preview` 全区块（Button/Card/Input/Select/Dropdown/Popover/Tooltip/Switch/Badge/Skeleton）
- [x] `#/database` 筛选/表格/看板/新建按钮
- [x] `#/settings` 表单控件
- [x] 明亮 + 深色
- [x] AppShell 登录/rail/通知/toast/搜索面板
- [x] prefers-reduced-motion 全局门禁生效（tokens.css `@media` + `useMotion()`）
- [x] 零 tw-animate zoom-in-95/slide-in-from-* 残留（全项目 grep 清零）
- [x] 动画时长全部来自 tokens 变量，无 >300ms（Skeleton pulse 1.5s 除外）
- [x] type-check + lint + test(15) + build GREEN × 3 commits
