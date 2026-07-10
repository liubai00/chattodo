import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import AppShell from './AppShell.vue'

// P4c：路由直挂新壳 AppShell（AppShell 按 route.name switch 渲染对应视图）。
// hash 模式：避开生产 /todo/ 下的 nginx history fallback 配置。
// legacy App.vue 仍保留(未路由)，P4d 删除。
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/chat' },
  { path: '/chat', name: 'chat', component: AppShell },
  { path: '/database', name: 'database', component: AppShell },
  { path: '/projects/:selId?', name: 'projects', component: AppShell },
  { path: '/friends', name: 'friends', component: AppShell },
  { path: '/clarify/:selId?', name: 'clarify', component: AppShell },
  { path: '/nontodo/:selId?', name: 'nontodo', component: AppShell },
  { path: '/agent', name: 'agent', component: AppShell },
  { path: '/settings', name: 'settings', component: AppShell },
  { path: '/:pathMatch(.*)*', name: 'legacy', component: AppShell },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
