// 动效常量（CSS 友好字符串 + 运行时 reduced-motion 门禁）。
// 与 src/styles/tokens.css 的 --duration-* / --ease-* 对齐，与 @/motion/easings.ts
// （GSAP 数值秒形式）同源。组件内联样式 / class 拼接用这里的 CSS 字符串；GSAP
// 动画继续用 @/motion/easings.ts 的数值形式。
//
// 分层：shared -> motion（motion 为基础设施层，见 docs/architecture.md 已知例外）。
export {
  // P14 Linear tokens
  EASE_ENTRANCE, EASE_EXIT, EASE_NEUTRAL,
  DURATION_COMPLEX, DURATION_FUNCTIONAL, DURATION_IMMEDIATE,
  SHIFT_X_ENTER, SHIFT_X_LEAVE, SHIFT_Y_SMALL, STAGGER_ITEM_MS,
  SCALE_DRAG_START, ROTATE_DRAG,
  // legacy
  DURATION_FAST, DURATION_BASE, DURATION_MEDIUM, DURATION_SLOW, DURATION_ROUTE,
  // 运行时 reduced-motion 检测（GSAP/JS 动画门禁）
  prefersReducedMotion, isMobileTransition,
} from '@/motion/easings'

/* ---------- CSS 字符串形式（与 tokens.css --duration-* / --ease-* 同值） ---------- */

/** 110ms：按钮 hover / 点击 */
export const DURATION_FAST_CSS = '110ms'
/** 160ms：微量位移 */
export const DURATION_BASE_CSS = '160ms'
/** 200ms：组件 / 颜色切换 */
export const DURATION_MEDIUM_CSS = '200ms'
/** 300ms：区块入场 */
export const DURATION_SLOW_CSS = '300ms'
/** 350ms：路由/大浮层（P14） */
export const DURATION_COMPLEX_CSS = '350ms'
/** 250ms：视图切换/通知/搜索面板（P14） */
export const DURATION_FUNCTIONAL_CSS = '250ms'

/** ease-in：离场（先慢后快） */
export const EASE_IN_CSS = 'cubic-bezier(0.4, 0, 1, 1)'
/** ease-in-out：切换（匀速缓冲） */
export const EASE_IN_OUT_CSS = 'cubic-bezier(0.7, 0, 0.39, 0.98)'
/** ease-out：入场（先快后慢，Attio 主缓动） */
export const EASE_OUT_CSS = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** 颜色/边框/背景过渡字符串（200ms ease-in-out），用于内联 transition。 */
export const TRANSITION_COLORS_CSS = `background-color ${DURATION_MEDIUM_CSS} ${EASE_IN_OUT_CSS}, color ${DURATION_MEDIUM_CSS} ${EASE_IN_OUT_CSS}, border-color ${DURATION_MEDIUM_CSS} ${EASE_IN_OUT_CSS}`
