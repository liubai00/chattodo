import type { Directive } from 'vue'
import gsap from 'gsap'
import { DURATION_FUNCTIONAL, prefersReducedMotion } from './easings'

// Chat 消息首次入场(设计稿 lx-fade):opacity 0→1 + y14 + scale .98→1、250ms。
// 用法：<div v-message-enter>...</div>
// 仅 mount 时触发一次；streaming 状态的同一 id 禁止 re-enter（由 bindings 控制）。
export const vMessageEnter: Directive<HTMLElement, boolean | undefined> = {
  mounted(el, binding) {
    // binding.value === true 时为 streaming 态，跳过动画
    if (binding.value === true) {
      el.style.opacity = '1'
      return
    }
    if (prefersReducedMotion()) {
      el.style.opacity = '1'
      return
    }
    try {
      gsap.fromTo(
        el,
        { opacity: 0, y: 14, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: DURATION_FUNCTIONAL, ease: 'power2.out' },
      )
    } catch (e) {
      console.error('[v-message-enter] gsap failed, showing element:', e)
      el.style.opacity = '1'
    }
  },
}
