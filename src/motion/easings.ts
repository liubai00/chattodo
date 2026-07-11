// 动效参数：与 tokens.css 的 cubic-bezier / duration 对齐。
// GSAP 用 ease 字符串近似（power3.out ≈ cubic-bezier(0.16,1,0.3,1)）。
// 总纲：短时长透明度渐变 + 微量 Y 位移/微小缩放，统一柔和缓动，无夸张形变。
export const EASE_OUT = 'power3.out' // 入场：先快后慢
export const EASE_IN_OUT = 'power3.inOut' // 切换/离场：匀速缓冲

export const DURATION_FAST = 0.11 // 110ms：按钮 hover/点击
export const DURATION_BASE = 0.16 // 160ms：微量位移
export const DURATION_MEDIUM = 0.2 // 200ms：组件切换
export const DURATION_SLOW = 0.3 // 300ms：区块入场
export const DURATION_ROUTE = 0.3 // 300ms：路由淡入淡出（MD §5.1）

// 运动幅度约束
export const SHIFT_Y = 4 // 位移 ≤4px（MD §4.1.4 translateY(-4px)）
export const SCALE_PRESS = 0.97 // 按压（MD §4.1.2）
export const SCALE_HOVER = 1.02 // hover 放大（MD §4.1.2）

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
