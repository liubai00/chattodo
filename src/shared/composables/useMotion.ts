// useMotion：运行时 reduced-motion 门禁（JS 驱动的动画与 CSS 过渡类）。
// CSS 过渡已由 tokens.css 全局 @media (prefers-reduced-motion: reduce) 把
// transition-duration 压到 0.001ms —— 这里是第二道门（composition 层），
// 供 JS 动画（GSAP）在调用前跳过、以及 CSS 类按需移除。
import { prefersReducedMotion } from '@/shared/constants/motion'

export function useMotion() {
  const reduced = prefersReducedMotion()

  /**
   * 如果用户偏好 reduced-motion，返回 ''；否则返回传入的 classes 拼接。
   * 用于在模板中包裹过渡/动画类：
   *   :class="cn('...', mot.motionSafe('transition-colors duration-[160ms]'))"
   */
  function motionSafe(...classes: string[]): string {
    return reduced ? '' : classes.filter(Boolean).join(' ')
  }

  /** 标准颜色过渡（160ms Attio ease-in-out），reduced-motion 下为空字符串。 */
  const transitionColors = reduced
    ? ''
    : 'transition-colors duration-[160ms] ease-[cubic-bezier(0.7,0,0.39,0.98)]'

  return { reduced, motionSafe, transitionColors }
}
