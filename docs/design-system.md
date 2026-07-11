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

## 3. 动效令牌

单一来源对齐三处：`tokens.css`（CSS 变量）、`@/motion/easings.ts`（GSAP 数值秒）、`@/shared/constants/motion.ts`（CSS 字符串 + re-export）。三处同值，禁止散落硬编码。

| 令牌 | CSS 变量 | GSAP（秒） | 用途 |
|------|----------|-----------|------|
| duration-fast | `--duration-fast: 110ms` | `DURATION_FAST=0.11` | 按钮 hover/点击 |
| duration-base | `--duration-base: 160ms` | `DURATION_BASE=0.16` | 微量位移 |
| duration-medium | `--duration-medium: 200ms` | `DURATION_MEDIUM=0.2` | 组件/颜色切换 |
| duration-slow | `--duration-slow: 300ms` | `DURATION_SLOW=0.3` | 区块入场 |
| ease-out | `--ease-out: cubic-bezier(0.16,1,0.3,1)` | `EASE_OUT='power3.out'` | 入场（Attio 主缓动） |
| ease-in-out | `--ease-in-out: cubic-bezier(0.7,0,0.39,0.98)` | `EASE_IN_OUT='power3.inOut'` | 切换/离场 |

> 计划文档中提到的「150ms / 200ms」为名义值；实际以 `tokens.css` 的 110/160/200/300 为准（`duration-fast ≈ 150`、`duration-normal = duration-medium = 200`）。

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

`FilterSelect` / `SearchField` / `SegmentedControl` / `NavItem` / `IconButton` / `SurfacePanel` / `Checkbox`——见 P12-2 commit。

## 6. 双主题验收 checklist

每个新组件/改版视图须在浅色与 `data-theme="dark"` 下各过一遍：

- [ ] 背景层级正确：`--bg`(sunken) < `--panel`(base) < `--elev`(raised)，暗色下不糊成一片
- [ ] 边框可见：暗色下 `--border-default=#3b3b3b` 不消失；hairline 用 `--border-subtle`
- [ ] 文本对比：`--text` / `--text2` / `--text3` 三级在暗色下可读（`--text3=#707070` 仅用于 meta）
- [ ] accent 紫色 `--accent` 在两主题下一致；soft 底 `--accent-soft` 跟随
- [ ] 下拉/气泡：`bg-popover`（raised）+ `border` + `shadow-md`，暗色下阴影加深（tokens 已调）
- [ ] focus ring：`--focus-ring`（accent 28% 透明）两主题可见
- [ ] 动效：reduced-motion 下 transition/animation 压停；正常下 160–200ms ease-in-out

> 暗色截图 checklist（P12-6 补）：Database 筛选/表格/看板、AppShell rail + 登录、FilterSelect 下拉面板。
