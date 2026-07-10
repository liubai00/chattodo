// AI 接入预设：选中即预填 provider/baseUrl/模型，全部字段仍可自由编辑。
// 旧 App.vue 的 _aiPresets 内联列表是迁移期临时副本；新视图用本模块为准，P4 旧 App 删除后仅此一份。
export interface AiPreset {
  name: string
  provider: string
  baseUrl: string
  models: string[]
  hint: string
}

export const AI_PRESETS: AiPreset[] = [
  { name: '规则版（离线）', provider: 'rule', baseUrl: '', models: [], hint: '无需 Key，离线规则分类' },
  { name: 'OpenAI', provider: 'openai', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'o3'], hint: '' },
  { name: 'Claude', provider: 'anthropic', baseUrl: '', models: ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'], hint: 'Base URL 留空使用官方接口' },
  { name: 'DeepSeek', provider: 'openai', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'], hint: '' },
  { name: '通义千问', provider: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'], hint: '' },
  { name: 'Kimi', provider: 'openai', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k'], hint: '' },
  { name: '豆包', provider: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: [], hint: '模型填接入点 ID' },
  { name: 'Gemini', provider: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.5-pro', 'gemini-2.5-flash'], hint: '走 OpenAI 兼容层' },
  { name: '自定义', provider: 'openai', baseUrl: '', models: [], hint: '任何 OpenAI 兼容服务：自填 Base URL 与模型' },
]
