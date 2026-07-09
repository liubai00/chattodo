import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import LegacyApp from './legacy/LegacyApp.vue'

// 迁移期：所有视图路由都兜底渲染 LegacyApp（旧 App.vue，class Component 状态机）。
// 视图逐个迁移后，把对应路由的 component 换成新页面，并从旧 App.vue 移除该分支。
// hash 模式：避开生产 /todo/ 下的 nginx history fallback 配置。
// 注：1a 阶段 URL 不与旧 App 内部 view 同步（无路由桥）；1b 起在 App.vue setup() 接桥。
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: LegacyApp },
  { path: '/chat', name: 'chat', component: LegacyApp },
  { path: '/database', name: 'database', component: LegacyApp },
  { path: '/projects', name: 'projects', component: LegacyApp },
  { path: '/friends', name: 'friends', component: LegacyApp },
  { path: '/clarify', name: 'clarify', component: LegacyApp },
  { path: '/nontodo', name: 'nontodo', component: LegacyApp },
  { path: '/agent', name: 'agent', component: LegacyApp },
  { path: '/settings', name: 'settings', component: LegacyApp },
  { path: '/:pathMatch(.*)*', name: 'legacy', component: LegacyApp },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
