import { createApp } from 'vue';
import App from './App.vue';
import './styles/tokens.css'; // design tokens first, so app styles can reference them
import './styles.css';

const app = createApp(App);

// 企业级兜底：任何未捕获的渲染/回调错误 → 控制台留痕 + 页面可见提示，
// 避免整个应用静默白屏（Vue 捕获后组件树保持存活）。
let bannerShown = false;
function showErrorBanner(msg) {
  if (bannerShown) return;
  bannerShown = true;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;bottom:var(--space-5);transform:translateX(-50%);z-index:9999;background:var(--status-error);color:var(--accent-contrast);padding:var(--space-3) var(--space-5);border-radius:var(--radius-lg);font:var(--font-medium) var(--text-sm)/1.4 var(--font-sans);box-shadow:var(--shadow-lg);max-width:80vw;';
  el.textContent = '界面发生异常：' + String(msg).slice(0, 120) + '（已记录，刷新可恢复）';
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); bannerShown = false; }, 6000);
}

app.config.errorHandler = (err, _inst, info) => {
  console.error('[LinX] Vue error:', err, info);
  showErrorBanner((err && err.message) || info || 'unknown');
};
window.addEventListener('unhandledrejection', (e) => {
  console.error('[LinX] unhandled rejection:', e.reason);
});

app.mount('#app');
