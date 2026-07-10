// Agent 域 API：Agent 人格配置 / 自动规则。
import { request } from '@/infrastructure/request'
import type { Agent, AutoRule } from '@/types/api'

export const AgentAPI = {
  getAgent: () => request<Agent>('GET', '/agent'),
  updateAgent: (patch: Partial<Agent>) => request<Agent>('PUT', '/agent', patch),
  autoRules: () => request<{ rules: AutoRule[] }>('GET', '/auto-rules'),
  deleteAutoRule: (id: string) => request<null>('DELETE', `/auto-rules/${id}`),
}
