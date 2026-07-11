# 设计系统（Attio 风格）

P12 起沉淀的视觉与动效规范。前置：`src/styles/tokens.css`（Attio 令牌）、`src/styles.css`（应用语义层）、`src/styles/tailwind.css`（Tailwind v4 + 作用域 preflight + `@theme inline` 映射）。

## 1. 三层组件分层

依赖方向与 `docs/architecture.md` 一致：`ui → base → business → views`，左侧禁止反向依赖右侧。

| 层 | 路径 | 职责 | 铁律 |
|----|------|------|------|
| **ui** | `components/ui/*` | ShadCN 原子（reka-ui 包装 + Tailwind 工具类 + `cn()`） | 零业务语义、零 API/store；props 带类型，禁止 `any` |
| **base** | `components/base/*` | 应用通用块（FilterSelect/SearchField/NavItem/…，读 tokens，支持 dark） | 零 API/store；hover/focus 走 `transition-colors`；reduced-motion 经 `useMotion` 门禁 |
| **business** | `components/business/*` | 领域组件（带业务 props/emits，禁 fetch） | 可组合 ui + base；状态由视图 composable 注入 |

> ui 层组件统一用 **Phosphor** 图标（`<i class="ph ph-xxx">`，CDN 见 `index.html`），不引入 lucide。ShadCN 官方源的 lucide 图标在本仓已替换为 Phosphor。

## 2. 令牌流转

```
tokens.css（原始：--surface-* / --border-* / --text-* / --accent / --radius-* / --duration-* / --ease-*）
        │
        ├─→ styles.css（应用语义：--bg / --panel / --mid / --line / --line2 / --text2 / --text3 / --accent-ink / --accent-bg …）
        │     └─ 旧内联样式直引 var(--bg) 等，dark 经 [data-theme="dark"] 自动流转
        └─→ tailwind.css @theme inline（Tailwind 工具类：bg-popover / border / text-foreground / bg-primary / ring-ring …）
              └─ 新 ui/base 组件用工具类，dark 经 @custom-variant dark 自动流转
```

关键映射（见 `tailwind.css`）：`--color-primary=--accent`（紫）、`--color-border=--border-default`、`--color-ring=--accent`、`--color-popover=--surface-raised`、`--color-accent=--surface-hover`（Tailwind 的 `accent` 是 hover 浅底，**不**覆盖 Attio 紫色 `--accent`，两者各司其职）。

## 3. 动效令牌（对齐 Attio/Notion MD §3）

单一来源对齐三处：`tokens.css`（CSS 变量）、`@/motion/easings.ts`（GSAP 数值秒）、`@/shared/constants/motion.ts`（CSS 字符串 + re-export）。三处同值，禁止散落硬编码。

| 令牌 | CSS 变量 | 用途 |
|------|----------|------|
| duration-immediate | `--duration-immediate: 120ms` | tap / toggle / active 即时反馈 |
| duration-standard | `--duration-standard: 200ms` | hover / dropdown / card 标准交互 |
| duration-functional | `--duration-functional: 300ms` | page / notification / modal 功能过渡 |
| delay-short | `--delay-short: 75ms` | 轻量延迟 |
| delay-medium | `--delay-medium: 150ms` | 标准延迟（如 Tooltip） |
| ease-neutral | `--ease-neutral: cubic-bezier(0.4,0,0.2,1)` | Notion 中性过渡 / hover+color |
| ease-entrance | `--ease-entrance: cubic-bezier(0.4,0,1,1)` | Linear 入场 / active+overlay-in |
| ease-exit | `--ease-exit: cubic-bezier(0.4,0,0.6,1)` | MD 标准离场 / overlay-out |
| ease-overlay-in | `--ease-overlay-in: cubic-bezier(0.23,1,0.32,1)` | overlay 入场 easeOutQuint |
| ease-overlay-out | `--ease-overlay-out: var(--ease-exit)` | overlay 离场（统一 MD exit） |

> **向后兼容**：`--duration-fast/medium/slow` 等旧别名仍可用，内部改为 `var(--duration-immediate/standard/functional)` 引用，零破坏。

### 动效策略 C（已锁定）

- **hover / focus / 展开**：CSS `transition-colors`（160–200ms ease-in-out），经 base 组件统一。
- **路由 / 面板 / FLIP**：现有 GSAP（`@/motion` 的 v-fade / routeTransition / useFlip）+ Vue `<Transition>`，不动。
- **reduced-motion 强制门禁**：`tokens.css` 全局 `@media (prefers-reduced-motion: reduce)` 把 `transition-duration/animation-duration` 压到 0.001ms（CSS 兜底）；JS/GSAP 动画经 `prefersReducedMotion()`（`@/shared/constants/motion` re-export 自 `@/motion/easings`）跳过。`useMotion()`（P12-6）在 composable 层再封一层。

## 4. 作用域 preflight（P12）

`tailwind.css` 内 `@layer base` 下仅对 `#lx-root`（应用壳根节点）做元素默认值归一化（box-sizing / 边框样式 / 表单控件字体继承 / 按钮背景重置）。放在 `@layer base`，故 `@layer utilities` 始终胜出（层叠顺序优先于特异性），内联 `style` 也始终胜出——不影响现有内联样式与工具类渲染。`admin/`（独立 HTML）与 `standalone.html` 在 `#lx-root` 之外，完全不受影响。

> 故意不 `@import "tailwindcss/preflight"`（全局 preflight），避免冲击 admin/ 与现有 body 级样式；改以手写作用域子集满足 ShadCN 组件的基线预期。

## 5. 组件清单

### ui 层（P12-1 新增）

| 组件 | 路径 | 备注 |
|------|------|------|
| Select | `ui/select` | reka-ui Select 包装；Trigger 内嵌 Phosphor `ph-caret-down`，Item 选中态 `ph-check` |
| Popover | `ui/popover` | reka-ui Popover；Content 含 portal + slide-in 动效 |
| Separator | `ui/separator` | reka-ui Separator；`bg-border` hairline |
| Badge | `ui/badge` | cva 变体：default/secondary/destructive/outline/success/warning |
| DropdownMenu | `ui/dropdown-menu` | reka-ui DropdownMenu；Content/Item/Label/Separator/Shortcut |
| Tooltip | `ui/tooltip` | reka-ui Tooltip；Content = `bg-foreground/text-background` 反色气泡 |
| Skeleton | `ui/skeleton` | `animate-pulse bg-muted`（reduced-motion 下被全局门禁压停） |

### base 层（P12-2 新增）

| 组件 | 路径 | 备注 |
|------|------|------|
| FilterSelect | `base/` | 封装 ui/Select；props `options {value,label}[]`、`modelValue`（string） |
| SearchField | `base/` | 左侧 Phosphor 放大镜 + 自适应 Input，`v-model` |
| SegmentedControl | `base/` | 泛型 layout 切换（icon+label）；激活态实底+阴影 |
| NavItem | `base/` | 侧栏项+计数 badge；垂直/水平两方向；active/hover CSS class |
| IconButton | `base/` | 图标按钮；ghost/solid/subtle 三变体；sm/md/lg 三尺寸；slot 支持红点等叠加 |
| SurfacePanel | `base/` | 面板容器（`bg-panel` + 可选 `border-r/l`） |
| Checkbox | `base/` | 表格行选/全选；转发原生 Event 供 `stopPropagation` |

### useMotion composable（P12-6）

`@/shared/composables/useMotion` 提供运行时 reduced-motion 门禁（JS 动画与 CSS 过渡类双道防线）：

| 产出 | 类型 | 说明 |
|------|------|------|
| `reduced` | `boolean` | 用户是否偏好 reduced-motion（调用 `prefersReducedMotion()`） |
| `motionSafe(...classes)` | `(cls: string[]) => string` | reduced 时返回 `''`，否则返回 classes 拼接 |
| `transitionColors` | `string` | `'transition-colors duration-[160ms] ease-[cubic-bezier(0.7,0,0.39,0.98)]'` 或 reduced 时 `''` |

> CSS 过渡同时受 tokens.css 全局 `@media (prefers-reduced-motion: reduce)` 把 `transition-duration` 压到 0.001ms 的 CSS 层防线保护 —— `useMotion` 是第二道防线（composition 层，JS 动画可在调用前跳过，CSS 类可按需移除）。

base 组件（P12-6 接入）：NavItem / IconButton / Checkbox / SegmentedControl 均已接入 `useMotion().transitionColors`。

## 6. 原语抛光（P12 后）

P12 装好了 ShadCN 默认皮肤，Attio 级手感需 **ui 层定点改**，不要全站 prompt 微调。

| 资源 | 路径 | 说明 |
|------|------|------|
| 验收页 | `#/design-preview`（DEV only） | `src/views/DesignPreviewView.vue` — Button/Select/Input/NavItem/Overlays 各状态 |
| 执行清单 | `docs/primitive-polish-checklist.md` | 6+1 文件、Attio 条款映射、每步短 prompt、打勾验收 |

推荐顺序：`motion.css` → `button` → `SelectContent` → `SelectItem/Trigger` → `Popover/Dropdown` → `Input` → `FilterSelect` 去壳 → `#/database` 整页。

### 动效 utility class（lx-overlay / lx-tooltip / lx-press / lx-btn-interact / lx-card-interact）

浮层（Select/Popover/DropdownMenu）统一用 `lx-overlay` class，Tooltip 用 `lx-tooltip`，按压反馈用 `lx-press`，按钮完整交互用 `lx-btn-interact`，卡片悬浮用 `lx-card-interact`。定义均位于 `src/styles/motion.css` 的 `@layer utilities`。

| class | 触发 | 时长/缓动 | 动画 |
|-------|------|----------|------|
| `lx-overlay` | `data-state="open"` / `data-state="closed"` | 200ms overlay-in/out | translateY(-4px) + opacity（MD §4.1.4） |
| `lx-tooltip` | `data-state="delayed-open"` / `data-state="closed"` | 150ms ease-out/ease-exit | translateY(-2px) + opacity（MD §4.3.2） |
| `lx-press` | `:active:not(:disabled)` | 120ms ease-entrance | scale(0.97) |
| `lx-btn-interact` | `:hover` / `:active` | 200ms ease-neutral / 120ms active | scale 1.02→0.97 + colors（MD §4.1.2） |
| `lx-card-interact` | `:hover` | 200ms ease-neutral | translateY(-4px) + shadow-md（MD §4.1.3） |

> **禁止**在 ui/base 层组件上使用 `tw-animate` 的 `zoom-in-95` / `slide-in-from-*` / `fade-in-*`，全部由上述 class 接管。transform-origin 走 reka-ui 提供的 `var(--reka-popper-transform-origin)`。Overlay 统一走 MD §4.1.4 的 `translateY(-4px) + opacity`，不使用 scale。

## 7. 暗色主题验收 checklist（P12-6 已验证）

各关键面在 `data-theme="dark"` 下核对通过（视觉推演）：

- [x] Database 表格/看板：`bg-[var(--bg)]` 表头底色、`bg-[var(--accent-bg)]` 选中行在暗色下清晰不糊；`--border-default=#3b3b3b` hairline 可见
- [x] AppShell rail：Tooltip 反色气泡（`bg-foreground/text-background`）双主题均高对比；导航 active 态 `--accent-bg`（16% 透明色混合）在暗色下可辨识
- [x] AppShell 登录屏：Card（`--surface-raised`）+ Input（`bg-[var(--bg)]` sunken）层级分明；`shadow-[var(--shadow)]` 暗色加深；focus ring `--accent` 可见
- [x] FilterSelect 下拉：`bg-popover`（raised）+ `border` + `shadow-md`，暗色下 `--surface-raised=#222` 与 `--border-default=#3b3b3b` 不融
- [x] 动效门禁：tokens.css 全局 `@media (prefers-reduced-motion: reduce)` → `transition-duration: 0.001ms !important`（覆盖一切）；JS 经 `useMotion().reduced` 跳过 GSAP
- [x] 原生 `<select>`：`src/` 下 0 个（全部由 FilterSelect 替代）
