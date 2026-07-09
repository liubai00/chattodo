import gsap from 'gsap'
import { EASE_IN_OUT, DURATION_ROUTE, prefersReducedMotion } from './easings'

// 路由淡入淡出：280ms ease-in-out，全局容器透明度渐变，无推拉/无遮罩。
// 关键：done 必须被调用，否则 mode="out-in" 下新视图永不挂载=白屏。
// 故 gsap 调用包 try/catch，异常时也要 done()，保证过渡一定能完成。
export function onRouteEnter(el: Element, done: () => void) {
  if (prefersReducedMotion()) {
    done()
    return
  }
  try {
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: DURATION_ROUTE, ease: EASE_IN_OUT, onComplete: done })
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
  try {
    gsap.fromTo(el, { opacity: 1 }, { opacity: 0, duration: DURATION_ROUTE, ease: EASE_IN_OUT, onComplete: done })
  } catch (e) {
    console.error('[routeTransition leave] gsap failed, completing transition anyway:', e)
    done()
  }
}
