# Primitive Polish 清单

> **用途**：把 Attio 动效规范落到 **ui 层 6+1 个文件**，不靠长 prompt 全站微调。  
> **验收页**：开发环境 `#/design-preview`（`src/views/DesignPreviewView.vue`）  
> **原则**：一次只改 1–2 个文件 → 刷新验收页 → 你截图说「再慢一点/再扁一点」→ 打勾

---

## 开始前

- [ ] `npm run dev` 已启动
- [ ] 浏览器打开 `http://localhost:5173/#/design-preview`（端口以终端为准）
- [ ] 侧栏主题切换试过 **明亮 + 深色** 两套
- [ ] Attio 或 Linear 同页并排（或录屏对比）

---

## 文件 0（新建）· 动效唯一实现处

**路径**：`src/styles/motion.css`  
**Attio 对应**：§二（缓动/时长/幅度）· §五（统一物理缓动）  
**现状**：动效散落在 `tw-animate-css`（zoom-in-95）与各组件 class，参数不可控  
**目标**：所有 popover/select/dropdown 共用同一套 CSS 变量 + utility class

### 要做的事

- [ ] 新建 `motion.css`，定义：
  ```css
  @layer utilities {
    .lx-overlay-in {
      animation: lx-overlay-in var(--duration-overlay, 250ms) var(--ease-in-out) both;
    }
    .lx-overlay-out {
      animation: lx-overlay-out var(--duration-overlay, 250ms) var(--ease-in-out) both;
    }
    @keyframes lx-overlay-in {
      from { opacity: 0; transform: scale(0.95); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes lx-overlay-out {
      from { opacity: 1; transform: scale(1); }
      to   { opacity: 0; transform: scale(0.95); }
    }
    .lx-press {
      transition: transform var(--duration-press, 120ms) var(--ease-in-out);
    }
    .lx-press:active:not(:disabled) {
      transform: scale(0.97);
    }
  }
  ```
- [ ] 在 `src/main.ts` 于 `tokens.css` 之后 import：`import './styles/motion.css'`
- [ ] 在 `tokens.css` 补充（若尚无）：`--duration-overlay: 250ms;` `--duration-press: 120ms;`
- [ ] **禁止**在新代码里再写 `zoom-in-95` / `slide-in-from-*`

### 验收标准

- [ ] DesignPreview §Select / §Overlays 展开 feels：微缩放 + 淡入，无侧滑
- [ ] `prefers-reduced-motion: reduce` 下动画仍被全局门禁压停（已有 tokens.css 兜底）

### 给 Claude 的短 prompt（复制即用）

```
只改 src/styles/motion.css（新建）+ src/main.ts import + tokens.css 补 --duration-overlay/--duration-press。
实现 Attio overlay：250ms ease-in-out，scale 0.95↔1 + opacity。不要动 business/views。
改完告诉我刷新 #/design-preview 看哪两块。
```

---

## 文件 1 · Button 按压缩放 + hover

**路径**：`src/components/ui/button/index.ts`  
**Attio 对应**：§三(一)1 — hover 200ms 色相加深；active scale(0.97) 120ms  
**现状**：仅 `transition-colors`，无 scale，无 duration 令牌  

### 要做的事

- [ ] base class 改为：
  - `transition-[color,background-color,border-color,transform]`
  - `duration-[var(--duration-medium)]`（200ms）或拆 hover 200 / press 120
  - 追加 `lx-press`（来自 motion.css）或 inline `active:scale-[0.97] active:duration-[120ms]`
- [ ] `default` variant：`hover:bg-primary/90` 保留，确认紫色加深够明显
- [ ] `outline` variant：hover 仅边框/底色微亮，**不加 shadow**
- [ ] `ghost` / `link`：仅文字色过渡

### 验收标准

- [ ] DesignPreview §Button：按住 Primary 有轻微收缩，松手即时回弹
- [ ] hover 无阴影扩散、无上浮
- [ ] disabled 无 scale 反馈

### 短 prompt

```
只改 src/components/ui/button/index.ts：Attio 按钮 — hover 200ms 颜色，active scale(0.97) 120ms ease-in-out。
用 tokens 的 --duration-medium / --duration-press。不要改 views。
```

---

## 文件 2 · Select 下拉动效

**路径**：`src/components/ui/select/SelectContent.vue`  
**Attio 对应**：§三(二)2 — 原点 scale(0.95→1) + opacity 250ms ease-in-out  
**现状**：`zoom-in-95` + `fade-in-0` + `translate-y-1`（tw-animate，时序不可控）  

### 要做的事

- [ ] 删除：`animate-in animate-out zoom-in-95 zoom-out-95 fade-in-0 fade-out-0`
- [ ] 删除：`data-[side=*]:translate-*` 侧向位移
- [ ] 改用：`data-[state=open]:lx-overlay-in data-[state=closed]:lx-overlay-out`
- [ ] 视觉：`rounded-[9px] border-[var(--line2)] bg-[var(--elev)] shadow-[var(--shadow-md)]`（与 FilterSelect 外壳统一）
- [ ] `transform-origin` 设为 `var(--reka-popper-transform-origin)`（reka 已提供）

### 验收标准

- [ ] FilterSelect + 裸 Select 展开/收起手感一致
- [ ] 无「从上方滑入 2px」的 jump
- [ ] 250ms 内完成，不拖沓

### 短 prompt

```
只改 SelectContent.vue：去掉 tw-animate zoom/slide，改用 motion.css 的 lx-overlay-in/out。
popover 视觉对齐 var(--elev)/--line2/--shadow-md。不要改 FilterSelect.vue。
```

---

## 文件 3 · Select 条目 + 触发器

**路径**：  
- `src/components/ui/select/SelectItem.vue`  
- `src/components/ui/select/SelectTrigger.vue`  

**Attio 对应**：§三(一)3 表单态 · item hover 浅底无抖动  

### 要做的事

**SelectItem**

- [ ] `rounded-[7px]`（非 `rounded-sm`）
- [ ] hover/focus：`bg-[var(--mid)]` 或 `bg-accent`（确认 dark 下可读）
- [ ] `py-2 pl-2.5 pr-8 text-[13px]`
- [ ] 选中 check 图标：`text-[var(--accent-ink)]`

**SelectTrigger**

- [ ] 默认高度与 Database FilterSelect 对齐：`h-[34px] rounded-[9px] text-[13px]`
- [ ] `border-[var(--line2)] bg-[var(--panel)] shadow-none`
- [ ] focus：`ring-2 ring-[var(--accent)] ring-offset-0`（200ms，无 pulse）

### 验收标准

- [ ] 键盘 ↑↓ 切换 option 时 hover 色跟手
- [ ] Trigger 与 FilterSelect 外壳可逐步去重（见文件 6）

### 短 prompt

```
只改 SelectItem.vue + SelectTrigger.vue：Attio 圆角/hover/focus，选中态紫色 check。
Trigger 默认样式对齐 Database FilterSelect 外壳。不要动 business。
```

---

## 文件 4 · Popover + Dropdown 对齐 Select

**路径**：  
- `src/components/ui/popover/PopoverContent.vue`  
- `src/components/ui/dropdown-menu/DropdownMenuContent.vue`  

**Attio 对应**：§三(二)2（与 Select 同一套）  

### 要做的事

- [ ] 与 SelectContent **同一套** class：去掉 zoom/slide-in，换 `lx-overlay-in/out`
- [ ] Dropdown：`rounded-[9px] p-1`；Item hover 同 SelectItem
- [ ] Popover：`rounded-[9px] p-4`

### 验收标准

- [ ] DesignPreview §Overlays 三种弹出层动效一致
- [ ] 与 Attio 下拉对比无明显「弹簧感」

### 短 prompt

```
PopoverContent + DropdownMenuContent 与 SelectContent 统一：lx-overlay-in/out，去掉 slide-in-from-*。
只改这两个文件。
```

---

## 文件 5 · Input focus 态

**路径**：`src/components/ui/input/Input.vue`  
**Attio 对应**：§三(一)3 — focus 边框提亮 200ms，无外发光脉冲  

### 要做的事

- [ ] `transition-[border-color,box-shadow]` `duration-[200ms]`
- [ ] focus：`ring-2 ring-[var(--accent)]` 或 border-color → `--accent`（二选一，保持克制）
- [ ] 默认：`border-[var(--line2)] bg-[var(--panel)] rounded-[9px] h-[34px]`

### 验收标准

- [ ] DesignPreview §Input Tab 聚焦无闪烁
- [ ] SearchField 内嵌原生 input 若不同步，仅加 TODO（SearchField 后续单独收）

### 短 prompt

```
只改 Input.vue：200ms focus 边框/ring，Attio 克制无 glow。rounded-[9px] h-[34px]。
```

---

## 文件 6 · FilterSelect 去壳（可选，最后做）

**路径**：`src/components/ui/../base/FilterSelect.vue`  
**Attio 对应**：无（架构清理）  
**现状**：Trigger 上重复写死 `h-[34px] rounded-[9px]…`，与 ui SelectTrigger 双份维护  

### 要做的事

- [ ] 文件 3 完成后，删除 FilterSelect Trigger 上的重复 visual class，只留 `class="w-[…]"` 等布局
- [ ] 或保留 `min-w-[110px]` 等业务尺寸 props

### 验收标准

- [ ] Database `#/database` 筛选条外观与改前一致或更好
- [ ] FilterSelect 代码 ≤ 25 行 template

---

## 整页验收（全部打勾后）

- [ ] `#/design-preview` 明亮/深色各截图存档
- [ ] `#/database` 筛选 + 表格/看板切换 + 「+ 新建」按钮
- [ ] `#/settings` 若有 FilterSelect 一并 spot check
- [ ] `npm run type-check && npm run lint:check && npm run build` 通过
- [ ] 更新 `docs/design-system.md` §动效 增加「overlay 用 lx-overlay-*」一句

---

## 不建议做的事

| 动作 | 原因 |
|------|------|
| 换 Element Plus / Ant Design | 脸不像 Attio，迁移成本巨大 |
| 再跑一整夜「全站 UI prompt」 | 无验收闭环，微调地狱 |
| 在 base/business 层写动效 | 违反分层，Database 应自动继承 ui |
| 混做 P13 设计模式 | UI 未定稿前不开架构 |

---

## 推荐执行顺序

```
0 motion.css → 1 button → 2 SelectContent → 3 Item/Trigger → 4 Popover/Dropdown → 5 Input → 6 FilterSelect 去壳 → Database 整页
```

每步：**改 → 刷新 design-preview → 你确认 → commit（可选）**

---

## 附：Attio 数值速查

| 场景 | 时长 | 缓动 | 幅度 |
|------|------|------|------|
| 按钮 hover | 200ms | ease-in-out | 色相差 |
| 按钮 active | 120ms | ease-in-out | scale 0.97 |
| 下拉/弹层 | 250ms | ease-in-out | scale 0.95→1 + opacity |
| 输入 focus | 200ms | ease-in-out | border/ring |
| 路由切换 | 280ms | ease-in-out | opacity only（已有 GSAP） |

令牌以 `src/styles/tokens.css` 为准；本清单 overlay/press 若 tokens 尚无，文件 0 一并补齐。
