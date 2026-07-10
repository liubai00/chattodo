// 应用级跨域 API：全局状态加载 / AI 捕获 / 搜索 / @提及。
// 这些端点横跨多个业务域（getState 返回全量状态、capture 分诊到 task|idea|nonTodo、
// search/mentions 跨实体检索），无单一属主，故归 app 域。
import { request } from '@/infrastructure/request'
import type { Task, Idea, NonTodo, SearchResult, User } from '@/types/api'

export const AppAPI = {
  getState: () => request<unknown>('GET', '/state'),
  capture: (text: string, source = 'chat') => request<Task | Idea | NonTodo>('POST', '/capture', { text, source }),
  search: (q: string) => request<SearchResult[]>('GET', `/search?q=${encodeURIComponent(q || '')}`),
  mentions: (q: string) => request<User[]>('GET', `/mentions?q=${encodeURIComponent(q || '')}`),
}
