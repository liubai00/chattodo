// 设置域 API：用户设置 / AI 配置（团队级 + 个人级 + 测试）/ 数据导出与清空。
import { request } from '@/infrastructure/request'
import type { Settings, AiConfig } from '@/types/api'

export const SettingsAPI = {
  getSettings: () => request<Settings>('GET', '/settings'),
  updateSettings: (patch: Partial<Settings>) => request<Settings>('PUT', '/settings', patch),

  getAiConfig: () => request<AiConfig>('GET', '/ai/config'),
  updateAiConfig: (patch: Partial<AiConfig>) => request<AiConfig>('PUT', '/ai/config', patch),
  updateOwnAiConfig: (patch: Partial<AiConfig>) => request<AiConfig>('PUT', '/ai/config/own', patch),
  clearOwnAiConfig: () => request<null>('DELETE', '/ai/config/own'),
  testAiConfig: (draft?: Partial<AiConfig>) => request<{ ok: boolean; error?: string; [k: string]: unknown }>('POST', '/ai/test', draft || {}),

  exportData: () => request<unknown>('GET', '/export'),
  clearData: () => request<unknown>('POST', '/data/clear'),
}
