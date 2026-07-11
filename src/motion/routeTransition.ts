import gsap from 'gsap'
import {
  EASE_NEUTRAL,
  DURATION_COMPLEX,
  SHIFT_X_ENTER,
  SHIFT_X_LEAVE,
  prefersReducedMotion,
  isMobileTransition,
} from './easings'

// P14 Linear 路由滑入切换：
// - 桌面：enter x+8px→0 opacity 0→1 / leave x→-4px opacity 1→0 / 350ms
// - 移动/reduced：opacity only 或 instant
// 关键：done 必须被调用，否则 mode="out-in" 下新视图永不挂载=白屏。
// GSAP fromTo 需要元素在 DOM 树中（读 parentNode），否则抛错 —— 在 set/fromTo 前
// 先检查 parentNode；若无则 fallback 到 done() 瞬时过渡。Vue Transition 保证 enter
// 时 el 已插入 DOM，但异步组件可能延迟。

function safeFromTo(
  el: Element,
  from: gsap.TweenVars,
  to: gsap.TweenVars & { onComplete?: () => void },
  done: () => void,
) {
  try {
    // 不预先 gsap.set —— 把初始状态放在 fromVars 里，
    // fromTo 自身处理 set→animate 动作链
    gsap.fromTo(el, from, to)
  } catch (e) {
    console.error('[routeTransition] gsap failed, completing transition anyway:', e)
    done()
  }
}

export function onRouteBeforeEnter(el: Element) {
  if (prefersReducedMotion()) return
  const x = isMobileTransition() ? 0 : SHIFT_X_ENTER
  // 用 CSS 设置初始状态（比 gsap.set 更早、不依赖 parentNode）
  const htmlEl = el as HTMLElement
  htmlEl.style.opacity = '0'
  htmlEl.style.transform = x ? `translateX(${x}px)` : ''
}

export function onRouteEnter(el: Element, done: () => void) {
  if (prefersReducedMotion()) {
    done()
    return
  }
  const xFrom = isMobileTransition() ? 0 : SHIFT_X_ENTER
  // 清除 CSS 初始状态再交 GSAP fromTo 接管
  const htmlEl = el as HTMLElement
  htmlEl.style.opacity = ''
  htmlEl.style.transform = ''

  safeFromTo(
    el,
    { opacity: 0, x: xFrom },
    { opacity: 1, x: 0, duration: DURATION_COMPLEX, ease: EASE_NEUTRAL, onComplete: done },
    done,
  )
}

export function onRouteLeave(el: Element, done: () => void) {
  if (prefersReducedMotion()) {
    done()
    return
  }
  const xTo = isMobileTransition() ? 0 : -SHIFT_X_LEAVE
  safeFromTo(
    el,
    { opacity: 1, x: 0 },
    { opacity: 0, x: xTo, duration: DURATION_COMPLEX, ease: EASE_NEUTRAL, onComplete: done },
    done,
  )
}
