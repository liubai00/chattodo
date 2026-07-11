import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Root from './app/Root.vue'
import { router } from '@/infrastructure/router'
import './styles/tokens.css' // Attio 设计令牌（先于其它样式，供 var() 引用）
import './styles/motion.css'  // Attio overlay/press 动效工具类（@layer utilities）
import './styles/tailwind.css' // Tailwind v4（迁移期不含 preflight，不影响旧 App）
import './styles.css'
import { vFade, vStagger } from './motion' // GSAP 动效指令（克制型微过渡）

const app = createApp(Root)
app.use(createPinia())
app.use(router)

// 全局动效指令：v-fade（区块入场 opacity+Y6px）、v-stagger（子元素错峰）。
// 按需在模板里使用；注册本身也验证 GSAP 能正常加载。
app.directive('fade', vFade)
app.directive('stagger', vStagger)

// 企业级兜底：任何未捕获的渲染/回调错误 -> 控制台留痕 + 页面可见提示，
// 避免整个应用静默白屏（Vue 捕获后组件树保持存活）。
let bannerShown = false
function showErrorBanner(msg: string) {
  if (bannerShown) return
  bannerShown = true
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;left:50%;bottom:var(--space-5);transform:translateX(-50%);z-index:9999;background:var(--status-error);color:var(--accent-contrast);padding:var(--space-3) var(--space-5);border-radius:var(--radius-lg);font:var(--font-medium) var(--text-sm)/1.4 var(--font-sans);box-shadow:var(--shadow-lg);max-width:80vw;'
  el.textContent = '界面发生异常：' + String(msg).slice(0, 120) + '（已记录，刷新可恢复）'
  document.body.appendChild(el)
  setTimeout(() => { el.remove(); bannerShown = false }, 6000)
}

app.config.errorHandler = (err, _inst, info) => {
  console.error('[LinX] Vue error:', err, info)
  const msg = err instanceof Error ? err.message : (info || 'unknown')
  showErrorBanner(msg)
}
window.addEventListener('unhandledrejection', (e) => {
  console.error('[LinX] unhandled rejection:', e.reason)
})

app.mount('#app')
