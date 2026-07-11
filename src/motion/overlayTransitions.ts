import gsap from 'gsap'
import {
  EASE_ENTRANCE,
  EASE_EXIT,
  EASE_NEUTRAL,
  DURATION_COMPLEX,
  DURATION_FUNCTIONAL,
  SHIFT_X_LEAVE,
  prefersReducedMotion,
} from './easings'

// GSAP fromTo / to 要求元素在 DOM 树中（`parentNode` 非 null），否则抛错。
// 浮层 enter/leave 的 Vue Transition hook 在 Portal teleport 时偶发 parentNode===null。
// 此 guard 在调用前检查，未挂载则 fallback 到 done()（Vue 会正常挂载元素，只是跳过动画）。
function guard(done: () => void, fn: () => void) {
  try {
    fn()
  } catch (e) {
    console.error('[overlay transition] gsap failed, completing:', e)
    done()
  }
}

// 右侧浮层 enter：x+20px→0 + opacity（TaskDetail 抽屉 / 通知面板 / Toast）
export function onOverlayRightEnter(el: Element, done: () => void) {
  if (prefersReducedMotion()) { done(); return }
  guard(done, () => {
    gsap.fromTo(
      el,
      { opacity: 0, x: 20 },
      { opacity: 1, x: 0, duration: DURATION_COMPLEX, ease: EASE_ENTRANCE, onComplete: done },
    )
  })
}

// Toast leave：x+20px + opacity 250ms
export function onToastLeave(el: Element, done: () => void) {
  if (prefersReducedMotion()) { done(); return }
  guard(done, () => {
    gsap.to(el, {
      opacity: 0, x: 20, duration: DURATION_FUNCTIONAL, ease: EASE_EXIT, onComplete: done,
    })
  })
}

// 中心浮层 enter：scale 0.98→1 + opacity（搜索 ⌘K / 快捷键 modal）
export function onOverlayCenterEnter(el: Element, done: () => void) {
  if (prefersReducedMotion()) { done(); return }
  guard(done, () => {
    gsap.fromTo(
      el,
      { opacity: 0, scale: 0.98 },
      { opacity: 1, scale: 1, duration: DURATION_COMPLEX, ease: EASE_ENTRANCE, onComplete: done },
    )
  })
}

// 浮层通用 leave：opacity→0 250ms
export function onOverlayLeave(el: Element, done: () => void) {
  if (prefersReducedMotion()) { done(); return }
  guard(done, () => {
    gsap.to(el, {
      opacity: 0, duration: DURATION_FUNCTIONAL, ease: EASE_EXIT, onComplete: done,
    })
  })
}

// Database lx-view table↔board：x 滑入 250ms（桌面）/ opacity only（移动）
export function onViewEnter(el: Element, done: () => void) {
  if (prefersReducedMotion()) { done(); return }
  const xFrom = window.innerWidth < 820 ? 0 : SHIFT_X_LEAVE
  guard(done, () => {
    gsap.fromTo(
      el,
      { opacity: 0, x: xFrom },
      { opacity: 1, x: 0, duration: DURATION_FUNCTIONAL, ease: EASE_NEUTRAL, onComplete: done },
    )
  })
}

// Database lx-view leave
export function onViewLeave(el: Element, done: () => void) {
  if (prefersReducedMotion()) { done(); return }
  const xTo = window.innerWidth < 820 ? 0 : -(SHIFT_X_LEAVE)
  guard(done, () => {
    gsap.fromTo(
      el,
      { opacity: 1, x: 0 },
      { opacity: 0, x: xTo, duration: DURATION_FUNCTIONAL, ease: EASE_NEUTRAL, onComplete: done },
    )
  })
}
