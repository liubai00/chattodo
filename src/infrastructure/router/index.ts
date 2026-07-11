// 路由表 + router 实例。hash 模式：避开生产 /todo/ 下的 nginx history fallback 配置。
// 所有路由均渲染 AppShell（壳按 route.name switch 渲染对应视图，view-splitting 在壳内完成）。
//
// 分层说明：AppShell 属 app 壳（路由宿主），不在 modules / views / stores 业务逻辑之列，
// 故 infrastructure 引用它不违反「infrastructure 禁止 import 业务逻辑」的铁律。
// 路由 path / name / 守卫与拆分前完全一致（行为不变）。
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import AppShell from '@/app/AppShell.vue'

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

// 设计原语验收页（仅开发构建；生产 bundle 不含此路由）
if (import.meta.env.DEV) {
  routes.push({ path: '/design-preview', name: 'design-preview', component: AppShell })
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
