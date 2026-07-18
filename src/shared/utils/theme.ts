// 主题应用：设置 data-theme 属性 + 把 Attio token 子集写入 body 内联变量
// （供旧 App.vue 的大量内联样式 var(--bg) 等引用），并同步 rail 上的主题图标。
// 旧 App.applyTheme 与新视图共用本模块，避免迁移期出现两套主题逻辑。
// 注：light/dark 映射相同--真正的明暗切换由 tokens.css 响应 data-theme 驱动；
//     --accent 故意不在此列（会与 :root 的 --accent 形成自引用）。
//
// P15 主题切换动画：优先使用 View Transitions API（Chrome/Edge/Safari 18.2+），
// 降级为全屏遮罩淡入淡出（Firefox 等）。prefers-reduced-motion 时跳过动画。

import type { Theme } from '@/shared/enums/theme'
export type { Theme }

const TOK: Record<Theme, Record<string, string>> = {
  light: {
    '--bg': 'var(--surface-sunken)', '--panel': 'var(--surface-base)', '--mid': 'var(--surface-hover)',
    '--rail': 'var(--surface-sunken)', '--elev': 'var(--surface-raised)', '--text': 'var(--text-primary)',
    '--text2': 'var(--text-secondary)', '--text3': 'var(--text-tertiary)', '--line': 'var(--border-default)',
    '--line2': 'var(--border-strong)', '--accent-ink': 'var(--accent-active)', '--accent-bg': 'var(--accent-soft)',
    '--idea': 'var(--status-warning)', '--idea-bg': 'var(--status-warning-soft)', '--nono': 'var(--text-tertiary)',
    '--nono-bg': 'var(--surface-active)', '--danger': 'var(--status-error)', '--danger-bg': 'var(--status-error-soft)',
    '--shadow': 'var(--shadow-card)',
  },
  dark: {
    '--bg': 'var(--surface-sunken)', '--panel': 'var(--surface-base)', '--mid': 'var(--surface-hover)',
    '--rail': 'var(--surface-sunken)', '--elev': 'var(--surface-raised)', '--text': 'var(--text-primary)',
    '--text2': 'var(--text-secondary)', '--text3': 'var(--text-tertiary)', '--line': 'var(--border-default)',
    '--line2': 'var(--border-strong)', '--accent-ink': 'var(--accent-active)', '--accent-bg': 'var(--accent-soft)',
    '--idea': 'var(--status-warning)', '--idea-bg': 'var(--status-warning-soft)', '--nono': 'var(--text-tertiary)',
    '--nono-bg': 'var(--surface-active)', '--danger': 'var(--status-error)', '--danger-bg': 'var(--status-error-soft)',
    '--shadow': 'var(--shadow-card)',
  },
}

const OVERLAY_ID = 'lx-theme-transition-overlay'

/** 执行实际的 DOM 变更（data-theme + body 变量 + rail 图标） */
function applyDOM(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light')
  const m = TOK[theme]
  for (const p in m) document.body.style.setProperty(p, m[p])
  const ic = document.getElementById('lx-thm'); if (ic) ic.className = 'ph ph-' + (theme === 'dark' ? 'sun' : 'moon')
  const ic2 = document.getElementById('lx-thm2'); if (ic2) ic2.className = 'ph ph-' + (theme === 'dark' ? 'sun' : 'moon')
}

/**
 * 全屏遮罩降级方案：覆盖旧主题 bg 色的全屏 div，渐变淡出露出新主题。
 * 遮罩初始颜色 = 旧 --surface-base，视觉上与当前页面完全融合，然后 300ms 淡出。
 */
function overlayFallback(theme: Theme) {
  // 防止快速连点积累遮罩
  const stale = document.getElementById(OVERLAY_ID); if (stale) stale.remove()

  const oldBg = getComputedStyle(document.body).getPropertyValue('--surface-base').trim() || '#ffffff'
  const overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.style.cssText = `position:fixed;inset:0;z-index:99999;background:${oldBg};pointer-events:none;`
  document.body.appendChild(overlay)

  // 强制回流，确保遮罩在 opacity:1 渲染后再启动 transition
  overlay.getBoundingClientRect()

  applyDOM(theme)

  // Attio/Linear 节奏：300ms ease-in-out 交叉淡入淡出
  overlay.style.transition = 'opacity 300ms cubic-bezier(0.7, 0, 0.39, 0.98)'
  overlay.style.opacity = '0'

  const cleanup = () => { if (overlay.parentNode) overlay.remove() }
  overlay.addEventListener('transitionend', cleanup)
  // 兜底：transitionend 未触发时 400ms 后强制清理
  setTimeout(cleanup, 400)
}

export function applyTheme(theme: Theme) {
  // 减少动效偏好 → 直接切换
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReduced) { applyDOM(theme); return }

  // View Transitions API → 全页截图交叉淡入淡出（Chrome/Edge/Safari 18.2+）
  if ('startViewTransition' in document) {
    ;(document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(() => applyDOM(theme))
    return
  }

  // Firefox / 旧浏览器 → 全屏遮罩降级
  overlayFallback(theme)
}
