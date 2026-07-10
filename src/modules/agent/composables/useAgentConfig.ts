// Agent 域 composable：Agent 配置数据与操作（加载 / 改字段即存 / 删自动规则）。
// notify 回调把文案交回视图层展示。section 由视图持有并 v-model 绑 TabPills。
import { ref, reactive, computed } from 'vue'
import { AgentAPI } from '@/modules/agent/api'
import { AppAPI } from '@/modules/app/api'
import { useAsyncLoad } from '@/shared/composables/useAsyncLoad'
import type { Agent, AutoRule } from '@/types/api'

export type AgentSection = 'soul' | 'memory' | 'preferences' | 'workingStyle' | 'privacyRules' | 'followup'

export interface AgentSectionDef {
  id: AgentSection
  label: string
  icon: string
  description: string
}

// 语义化定义（替代旧元组 [id, 名称, 图标, 描述]，禁止下标访问）。
export const AGENT_DEFS: AgentSectionDef[] = [
  { id: 'soul', label: '人格 Soul', icon: 'ph-fingerprint', description: '人格、原则、语气、决策倾向' },
  { id: 'memory', label: '记忆 Memory', icon: 'ph-brain', description: '长期背景、固定项目、用户习惯' },
  { id: 'preferences', label: '偏好', icon: 'ph-sliders-horizontal', description: '输出偏好、排序偏好、沟通偏好' },
  { id: 'workingStyle', label: '工作方式', icon: 'ph-strategy', description: 'GTD、时间块等方法论偏好' },
  { id: 'privacyRules', label: '隐私规则', icon: 'ph-lock-simple', description: '哪些内容默认 work / personal，AI 何时不可读取' },
  { id: 'followup', label: '追问策略', icon: 'ph-chats-circle', description: '任务不清楚时如何追问' },
]

// 本地字段名 -> 后端列名（followup 在后端叫 defaultFollowupStrategy）
const FIELD_MAP: Record<AgentSection, string> = {
  soul: 'soul', memory: 'memory', preferences: 'preferences',
  workingStyle: 'workingStyle', privacyRules: 'privacyRules', followup: 'defaultFollowupStrategy',
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : ''
}

export function useAgentConfig(notify: (msg: string) => void) {
  const section = ref<AgentSection>('soul')
  const agent = reactive<Agent>({ soul: '', memory: '', preferences: '', workingStyle: '', privacyRules: '', followup: '' })
  const autoRules = ref<AutoRule[]>([])

  const { isLoading, execute: reload } = useAsyncLoad(async () => {
    const [st, rulesR] = await Promise.all([AppAPI.getState(), AgentAPI.autoRules()])
    const state = st as { agentProfile?: Record<string, string> }
    const ap = state.agentProfile || {}
    agent.soul = ap.soul || ''
    agent.memory = ap.memory || ''
    agent.preferences = ap.preferences || ''
    agent.workingStyle = ap.workingStyle || ''
    agent.privacyRules = ap.privacyRules || ''
    agent.followup = ap.defaultFollowupStrategy || ''
    autoRules.value = rulesR.rules || []
  }, { onError: () => notify('加载 Agent 配置失败，请刷新重试') })

  const current = computed(() => AGENT_DEFS.find((d) => d.id === section.value) || AGENT_DEFS[0])
  const value = computed(() => agent[section.value] || '')

  // textarea 失焦(@change)即存：避免逐键调 API；列名经 FIELD_MAP 映射（与旧 App 一致）。
  function setValue(v: string) {
    agent[section.value] = v
    AgentAPI.updateAgent({ [FIELD_MAP[section.value]]: v } as Partial<Agent>).catch(() => {})
  }

  function deleteRule(id: string) {
    AgentAPI.deleteAutoRule(id)
      .then(() => { autoRules.value = autoRules.value.filter((r) => r.id !== id); notify('已删除自动规则') })
      .catch((e) => notify('删除失败：' + errMsg(e)))
  }

  return { section, agent, autoRules, isLoading, current, value, reload, setValue, deleteRule }
}
