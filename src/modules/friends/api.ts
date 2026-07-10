// 好友域 API：好友列表 / 请求 / 响应 / 解除。
import { request } from '@/infrastructure/request'
import type { FriendLists } from '@/types/api'

export const FriendsAPI = {
  friends: () => request<FriendLists>('GET', '/friends'),
  friendRequest: (email: string) => request<unknown>('POST', '/friends/request', { email }),
  friendRespond: (id: string, accept: boolean) => request<unknown>('POST', `/friends/${id}/respond`, { accept }),
  friendRemove: (id: string) => request<null>('DELETE', `/friends/${id}`),
}
