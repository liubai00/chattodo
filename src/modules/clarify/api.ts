// 待澄清域 API：想法（idea）转 todo / 归档 / 丢弃。
import { request } from '@/infrastructure/request'

export const ClarifyAPI = {
  ideaConvert: (id: string) => request<unknown>('POST', `/todo-ideas/${id}/convert`),
  ideaArchive: (id: string) => request<unknown>('POST', `/todo-ideas/${id}/archive`),
  ideaDiscard: (id: string) => request<unknown>('POST', `/todo-ideas/${id}/discard`),
}
