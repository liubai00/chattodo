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
      // Apple 克制纪律:轻位移、无回弹、无 blur
      gsap.fromTo(
        children,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out', stagger: binding.value?.delay ?? 0.04 },
      )
    } catch (e) {
      console.error('[v-stagger] gsap failed, showing children:', e)
      children.forEach((c) => (c.style.opacity = '1'))
    }
  },
}
