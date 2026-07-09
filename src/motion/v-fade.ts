import type { Directive } from 'vue'
import gsap from 'gsap'
import { EASE_OUT, DURATION_MEDIUM, SHIFT_Y, prefersReducedMotion } from './easings'

// 区块入场：opacity 0->1 + Y 6px->0，ease-out，200ms。
// 用法：<div v-fade>...</div>
export const vFade: Directive<HTMLElement> = {
  mounted(el) {
    if (prefersReducedMotion()) {
      el.style.opacity = '1'
      return
    }
    try {
      gsap.fromTo(el, { opacity: 0, y: SHIFT_Y }, { opacity: 1, y: 0, duration: DURATION_MEDIUM, ease: EASE_OUT })
    } catch (e) {
      // GSAP 出错也保证元素可见，不阻断渲染
      console.error('[v-fade] gsap failed, showing element:', e)
      el.style.opacity = '1'
    }
  },
}
