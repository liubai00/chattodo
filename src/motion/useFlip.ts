import gsap from 'gsap'

// 看板拖拽重排 FLIP：Phase 1 实装时调用。
// Flip 插件按需懒加载（只在看板用到时才 import），不进首屏 bundle。
//   const { Flip } = await useFlip()
//   const state = Flip.getState(elements)
//   // ...DOM 变更（移动卡片到新列）...
//   Flip.from(state, { duration: DURATION_MEDIUM, ease: EASE_OUT, absoluteOnLeave: true })
type FlipPlugin = typeof import('gsap/Flip')['Flip']
let flip: FlipPlugin | null = null

export async function useFlip() {
  if (!flip) {
    const mod = await import('gsap/Flip')
    flip = mod.Flip
    gsap.registerPlugin(flip)
  }
  return { Flip: flip, gsap }
}
