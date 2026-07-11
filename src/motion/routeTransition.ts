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
// 故 gsap 调用包 try/catch，异常时也要 done()，保证过渡一定能完成。
export function onRouteBeforeEnter(el: Element) {
  if (prefersReducedMotion()) return
  try {
    gsap.set(el, { opacity: 0, x: isMobileTransition() ? 0 : SHIFT_X_ENTER })
  } catch (e) {
    console.error('[routeTransition beforeEnter] gsap set failed:', e)
  }
}

export function onRouteEnter(el: Element, done: () => void) {
  if (prefersReducedMotion()) {
    done()
    return
  }
  const xFrom = isMobileTransition() ? 0 : SHIFT_X_ENTER
  try {
    gsap.fromTo(
      el,
      { opacity: 0, x: xFrom },
      { opacity: 1, x: 0, duration: DURATION_COMPLEX, ease: EASE_NEUTRAL, onComplete: done },
    )
  } catch (e) {
    console.error('[routeTransition enter] gsap failed, completing transition anyway:', e)
    done()
  }
}

export function onRouteLeave(el: Element, done: () => void) {
  if (prefersReducedMotion()) {
    done()
    return
  }
  const xTo = isMobileTransition() ? 0 : -SHIFT_X_LEAVE
  try {
    gsap.fromTo(
      el,
      { opacity: 1, x: 0 },
      { opacity: 0, x: xTo, duration: DURATION_COMPLEX, ease: EASE_NEUTRAL, onComplete: done },
    )
  } catch (e) {
    console.error('[routeTransition leave] gsap failed, completing transition anyway:', e)
    done()
  }
}
