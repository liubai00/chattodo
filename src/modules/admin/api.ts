// 管理后台域 API：系统总览 / 用户详情（供 admin/ 后台消费）。
import { request } from '@/infrastructure/request'

export const AdminAPI = {
  adminOverview: () => request<{ users: unknown[]; records: unknown[]; [k: string]: unknown }>('GET', '/admin/overview'),
  adminUser: (id: string) => request<unknown>('GET', `/admin/users/${id}`),
}
