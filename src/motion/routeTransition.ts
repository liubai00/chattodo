import {
  prefersReducedMotion,
  isMobileTransition,
} from './easings'

// P14 Linear 路由滑入切换：
// - 桌面：enter x+8px→0 opacity 0→1 / leave x→-4px opacity 1→0 / 350ms
// - 移动/reduced：opacity only 或 instant
// 使用 CSS transition（非 GSAP），避免 GSAP 异步 tick 里读 parentNode 时元素已脱离 DOM。
// mode="out-in" 下 Vue 保证 enter 时新元素在 DOM、leave 时旧元素在 DOM 直到 done() 调用。

const DURATION = 350 // ms
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)' // power2.inOut ≈ --ease-neutral

function setup(el: Element, duration: number, ease: string) {
  const e = el as HTMLElement
  e.style.transition = `opacity ${duration}ms ${ease}, transform ${duration}ms ${ease}`
}

function cleanup(el: Element) {
  const e = el as HTMLElement
  e.style.transition = ''
  e.style.transform = ''
}

export function onRouteBeforeEnter(el: Element) {
  if (prefersReducedMotion()) return
  const x = isMobileTransition() ? 0 : 8 // SHIFT_X_ENTER=8
  const e = el as HTMLElement
  e.style.opacity = '0'
  e.style.transform = x ? `translateX(${x}px)` : ''
}

export function onRouteEnter(el: Element, done: () => void) {
  if (prefersReducedMotion()) {
    done()
    return
  }
  const e = el as HTMLElement
  setup(el, DURATION, EASE)
  // 强制 reflow 让浏览器把初始状态拍下来，再改目标状态触发 transition
  void e.offsetWidth
  e.style.opacity = '1'
  e.style.transform = 'translateX(0)'
  const onEnd = () => { cleanup(el); e.removeEventListener('transitionend', onEnd); done() }
  e.addEventListener('transitionend', onEnd)
}

export function onRouteLeave(el: Element, done: () => void) {
  if (prefersReducedMotion()) {
    done()
    return
  }
  const x = isMobileTransition() ? 0 : 4 // SHIFT_X_LEAVE=4
  const e = el as HTMLElement
  setup(el, DURATION, EASE)
  void e.offsetWidth
  e.style.opacity = '0'
  e.style.transform = x ? `translateX(-${x}px)` : ''
  const onEnd = () => { cleanup(el); e.removeEventListener('transitionend', onEnd); done() }
  e.addEventListener('transitionend', onEnd)
}
