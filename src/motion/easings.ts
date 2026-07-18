// 动效参数：与 tokens.css 的 cubic-bezier / duration 对齐。
// GSAP 用 ease 字符串近似。
// 总纲：短时长透明度渐变 + 微量 Y 位移/微小缩放，统一柔和缓动，无夸张形变。

// ──────── 切换 Token(Apple 克制纪律:浮层/路由 ≤250ms)────────
// 路由、TaskDetail、大浮层
export const DURATION_COMPLEX = 0.25
// Database lx-view、通知/搜索面板
export const DURATION_FUNCTIONAL = 0.25
// Chat 单条 enter、拖拽发起
export const DURATION_IMMEDIATE = 0.15

export const SHIFT_X_ENTER = 8    // 路由 enter（px）
export const SHIFT_X_LEAVE = 4    // 路由 leave（px）
export const SHIFT_Y_SMALL = 4    // 浮层、菜单项
export const STAGGER_ITEM_MS = 50 // 菜单项错峰（MD §3）
export const SCALE_DRAG_START = 1.04  // 设计稿拖拽姿态 scale(1.04)
export const ROTATE_DRAG = 2      // deg(设计稿 rotate(2deg))

// Linear 缓动（GSAP ease 字符串近似）
export const EASE_ENTRANCE = 'power4.out'   // ≈ cubic-bezier(0.4,0,1,1)
export const EASE_EXIT = 'power2.in'         // ≈ cubic-bezier(0.4,0,0.6,1)
export const EASE_NEUTRAL = 'power2.inOut'   // ≈ cubic-bezier(0.4,0,0.2,1)

// ──────── 原有令牌（向后兼容）────────
export const EASE_OUT = 'power3.out' // 入场：先快后慢
export const EASE_IN_OUT = 'power3.inOut' // 切换/离场：匀速缓冲

export const DURATION_FAST = 0.11 // 110ms：按钮 hover/点击
export const DURATION_BASE = 0.16 // 160ms：微量位移
export const DURATION_MEDIUM = 0.2 // 200ms：组件切换
export const DURATION_SLOW = 0.3 // 300ms：区块入场
export const DURATION_ROUTE = 0.25 // 250ms：路由滑入(Apple 纪律压自 350ms)

// 运动幅度约束
export const SHIFT_Y = 4 // 位移 ≤4px（MD §4.1.4 translateY(-4px)）
export const SCALE_PRESS = 0.97 // 按压（MD §4.1.2）
export const SCALE_HOVER = 1.02 // hover 放大（MD §4.1.2）

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 移动端/窄屏时切换仅 opacity，禁止 x 位移 */
export function isMobileTransition(): boolean {
  return window.innerWidth < 820
}
