// 通知域 API：通知列表 / 全部已读。
import { request } from '@/infrastructure/request'
import type { Notification } from '@/types/api'

export const NotificationsAPI = {
  notifications: () => request<Notification[]>('GET', '/notifications'),
  markAllNotificationsRead: () => request<null>('POST', '/notifications/read-all'),
}
