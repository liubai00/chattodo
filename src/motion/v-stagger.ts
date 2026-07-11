import type { Directive } from 'vue'
import gsap from 'gsap'
import { prefersReducedMotion } from './easings'

// 子元素错峰入场：同区块内子元素 15-30ms 依次递进显隐。
// 用法：<ul v-stagger="{ selector: 'li', delay: 0.02 }">...</ul>
// 不传 selector 时默认对直接子元素 :scope > * 生效。
export const vStagger: Directive<
  HTMLElement,
  { selector?: string; delay?: number } | undefined
> = {
  mounted(el, binding) {
    // :scope > * 选直接子元素（裸 "> *" 不是合法选择器，querySelectorAll 会抛错）
    const selector = binding.value?.selector ?? ':scope > *'
    let children: HTMLElement[] = []
    try {
      children = Array.from(el.querySelectorAll<HTMLElement>(selector))
    } catch (e) {
      console.error('[v-stagger] querySelectorAll failed:', e)
      return
    }
    if (!children.length) return
    if (prefersReducedMotion()) {
      children.forEach((c) => (c.style.opacity = '1'))
      return
    }
    try {
      gsap.fromTo(
        children,
        { opacity: 0, y: 20, scale: 0.94, filter: 'blur(4px)' },
        { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.5, ease: 'back.out(1.5)', stagger: binding.value?.delay ?? 0.05 },
      )
    } catch (e) {
      console.error('[v-stagger] gsap failed, showing children:', e)
      children.forEach((c) => (c.style.opacity = '1'))
    }
  },
}
