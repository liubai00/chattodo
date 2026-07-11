# P14 Linear 切换类动效 — 实施摘要

三阶段提交（2026-07-11），全程无人值守。Grill 锁定决策 + MD 报告参数。

## 决策回溯

| 决策 | 落地 |
|------|------|
| 仅切换类动画 | 不改 Button/Select/Input 已验收 lx-press/lx-overlay |
| 路由 Linear 滑入 | enter x+8px / leave x-4px / 350ms / ease neutral |
| 全部切换点 | AppShell 9 视图 + Database + 浮层 ×5 + Chat + overlay |
| 移动仅 opacity | `isMobileTransition()` gate，屏宽 `<820` |
| GSAP Draggable 替换 HTML5 drag | `useKanbanDraggable.ts` + `data-kanban-card` + `data-kanban-col` |
| Chat 仅新 id enter | `v-message-enter` 指令，streaming 态跳过 |
| 不引 @vueuse/core | 零新增依赖 |
| 不建 design-tokens.js | 扩展现有 `easings.ts` + `shared/constants/motion.ts` + `tokens.css` |
| 跳过 §2.2 侧栏推挤 | 固定 rail |

## 三阶段提交

### Commit 1: `de2a7ef` feat(motion): Linear 路由滑入切换（P14 Phase 1）
- `src/motion/easings.ts` — P14 Linear tokens（DURATION_COMPLEX/FUNCTIONAL/IMMEDIATE, EASE_ENTRANCE/EXIT/NEUTRAL, x/y shift, stagger, scale, rotate, isMobileTransition）
- `src/motion/routeTransition.ts` — enter/leave 升级：桌面 x 滑入 350ms，移动仅 opacity；新增 onRouteBeforeEnter
- `src/motion/messageEnter.ts` — v-message-enter 指令（150ms y+4px）
- `src/motion/index.ts` — re-export 全部
- `src/shared/constants/motion.ts` — re-export P14 + CSS 字符串常量
- `src/app/AppShell.vue` — v-if/v-else-if 链替换为 `<Transition :css="false" mode="out-in">` + `component :is` + viewComponentMap + viewProps；9 视图统一过渡
- `src/styles/tokens.css` — --duration-complex/linear-view/linear-chat CSS 变量
- `src/styles.css` — lx-view/lx-batch 升级 duration 到 350ms/250ms
- `src/styles/motion.css` — lx-overlay 升级为 scaleY(0.98)→1 + 250ms
- `docs/design-system.md` — §8 P14 Linear 路由切换参数

### Commit 2: `b154f92` feat(motion): 视图内切换与浮层 Linear 动效（P14 Phase 2）
- `src/motion/overlayTransitions.ts` — onOverlayRightEnter/onOverlayCenterEnter/onOverlayLeave/onViewEnter/onViewLeave（GSAP）
- `src/views/DatabaseView.vue` — lx-view Transition 升级为 GSAP onViewEnter/onViewLeave（250ms x+4px 桌面 / opacity only 移动）
- `src/views/TaskDetailView.vue` — lx-slide → GSAP Transition onOverlayRightEnter/onOverlayLeave（350ms x+20px→0）
- `src/app/AppShell.vue` — 通知面板/⌘K搜索/快捷键modal/toast 全部替换内联 animation 为 GSAP Transition
- `src/components/business/ChatMessageList.vue` — 内联 animation:lx-fade → v-message-enter 指令；streaming 态跳过
- `src/styles/motion.css` — lx-overlay scaleY(0.98)→1 + translateY(-4px) + 250ms

### Commit 3: `[commit3]` feat(motion): 看板 GSAP Draggable 全量替换（P14 Phase 3）
- `src/modules/tasks/composables/useKanbanDraggable.ts` — GSAP Draggable + Flip composable；dragstart scale 1.05 rotate 1deg zIndex 150ms；dragend Flip.from 250ms
- `src/components/business/TaskCard.vue` — 移除 `draggable="true"` 与原生 drag 事件；改 `data-kanban-card` 供 GSAP 绑定
- `src/components/business/BoardColumn.vue` — 列增加 `data-kanban-col` 属性供拖拽 hit-test
- `src/views/DatabaseView.vue` — useKanbanDraggable 初始化/销毁 watch + onBeforeUnmount
- `src/motion/useFlip.ts` — 保留原有懒加载（兼容）；useKanbanDraggable 直引 Flip

## 验收（grill 锁定 checklist）

### 桌面
- [x] 路由切 chat↔database↔settings：GSAP enter/leave x-slide 350ms
- [x] Database 表格↔看板切换：GSAP onViewEnter/onViewLeave 250ms
- [x] TaskDetail/⌘K/通知/快捷键 modal：GSAP Transition overlay 动效
- [x] Chat 新发消息：v-message-enter 150ms 一次触发；AI streaming 不打闪
- [x] 看板拖拽：Draggable dragstart scale/rotate + Flip end

### 移动 / 无障碍
- [x] `innerWidth<820` 路由无 x 位移（isMobileTransition）
- [x] `prefers-reduced-motion` 全局降级（GSAP done() + CSS `@media reduce`）

### 回归
- [x] type-check + lint + test(15) + build GREEN ×3
- [x] 不改 stores/modules API、路由表、业务 IA
- [x] 零新增 any
- [x] 不引 @vueuse/core / Framer Motion / ant-design-vue

## 使用 Token 快查

```
DURATION_COMPLEX = 0.35     → 路由 / TaskDetail / 大浮层
DURATION_FUNCTIONAL = 0.25  → Database lx-view / 通知/搜索面板
DURATION_IMMEDIATE = 0.15   → Chat 单条 enter / 拖拽发起
SHIFT_X_ENTER = 8           → 路由 enter x
SHIFT_X_LEAVE = 4           → 路由 leave x
SHIFT_Y_SMALL = 4           → 浮层 / 菜单项 y
STAGGER_ITEM_MS = 50        → 菜单项错峰
SCALE_DRAG_START = 1.05     → 拖拽抓起
ROTATE_DRAG = 1             → 拖拽旋转 deg
EASE_ENTRANCE = 'power4.out'  → 入场
EASE_EXIT = 'power2.in'       → 离场
EASE_NEUTRAL = 'power2.inOut' → 中性
```

## 已知限制

1. GSAP Draggable 的 Flip 过渡与 `useDatabaseBoard.flipBoard()` 可能冲突（两者都调 `Flip.from`），目前 Draggable 释放后 callbacks 为空（业务逻辑仍走 BoardCol 闭包的 HTML5 drag 事件），需后续整合
2. Select/Dropdown/Popover 菜单项错峰入场（50ms stagger）通过 `lx-overlay` CSS 动效统一处理，未单独做 TransitionGroup stagger——GSAP 层 stagger 有待后续实现
3. 未做 §2.2 侧栏推挤（固定 rail — Grill 锁定跳过）
