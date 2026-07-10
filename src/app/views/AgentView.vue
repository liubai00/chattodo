<script setup lang="ts">
// P3 第二个迁移视图：Agent 配置。自包含--挂载取 getState(agentProfile)+autoRules，
// 本地 reactive 持有；section 由旧 App 中栏导航经 prop 传入（布局零改动）。
// textarea @change 自动存(updateAgent，followup->defaultFollowupStrategy 列名映射)；
// memory section 额外展示由记忆生成的自动规则(可删)。toast 经 useToast。
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/lib/api'
import { useToast } from '@/stores/toast'
import Button from '@/components/ui/button/Button.vue'
import ViewHeader from '@/components/base/ViewHeader.vue'
import LoadingState from '@/components/base/LoadingState.vue'
import type { Agent, AutoRule } from '@/types/api'

type AgentSection = 'soul' | 'memory' | 'preferences' | 'workingStyle' | 'privacyRules' | 'followup'
defineProps<{ isMobile?: boolean }>()
const section = ref<AgentSection>('soul')

const toast = useToast()
const loading = ref(true)
const agent = reactive<Agent>({ soul: '', memory: '', preferences: '', workingStyle: '', privacyRules: '', followup: '' })
const autoRules = ref<AutoRule[]>([])

// [key, 名称, 图标, 描述]
const AGENT_DEFS: Array<[AgentSection, string, string, string]> = [
  ['soul', '人格 Soul', 'ph-fingerprint', '人格、原则、语气、决策倾向'],
  ['memory', '记忆 Memory', 'ph-brain', '长期背景、固定项目、用户习惯'],
  ['preferences', '偏好', 'ph-sliders-horizontal', '输出偏好、排序偏好、沟通偏好'],
  ['workingStyle', '工作方式', 'ph-strategy', 'GTD、时间块等方法论偏好'],
  ['privacyRules', '隐私规则', 'ph-lock-simple', '哪些内容默认 work / personal，AI 何时不可读取'],
  ['followup', '追问策略', 'ph-chats-circle', '任务不清楚时如何追问'],
]
// 本地字段名 -> 后端列名（followup 在后端叫 defaultFollowupStrategy）
const FIELD_MAP: Record<AgentSection, string> = {
  soul: 'soul', memory: 'memory', preferences: 'preferences',
  workingStyle: 'workingStyle', privacyRules: 'privacyRules', followup: 'defaultFollowupStrategy',
}

const agCur = computed(() => AGENT_DEFS.find((d) => d[0] === section.value) || AGENT_DEFS[0])
const agName = computed(() => agCur.value[1])
const agDesc = computed(() => agCur.value[3])
const agValue = computed(() => agent[section.value] || '')
const isMemorySection = computed(() => section.value === 'memory')

async function load() {
  loading.value = true
  try {
    const [st, rulesR] = await Promise.all([api.getState(), api.autoRules()])
    const ap = ((st as any).agentProfile || {}) as Record<string, any>
    agent.soul = ap.soul || ''
    agent.memory = ap.memory || ''
    agent.preferences = ap.preferences || ''
    agent.workingStyle = ap.workingStyle || ''
    agent.privacyRules = ap.privacyRules || ''
    agent.followup = ap.defaultFollowupStrategy || ''
    autoRules.value = rulesR.rules || []
  } catch {
    toast.flash('加载 Agent 配置失败，请刷新重试')
  } finally {
    loading.value = false
  }
}
onMounted(load)

// textarea 失焦时保存（@change，避免逐键调 API；与旧 App 一致）
function onAgent(e: Event) {
  const val = (e.target as HTMLTextAreaElement).value
  ;(agent as any)[section.value] = val
  const col = FIELD_MAP[section.value]
  api.updateAgent({ [col]: val } as any).catch(() => {})
}
function saveAgent() { toast.flash('Agent 配置已保存') }
function deleteRule(id: string) {
  api.deleteAutoRule(id)
    .then(() => { autoRules.value = autoRules.value.filter((r) => r.id !== id); toast.flash('已删除自动规则') })
    .catch((e: any) => toast.flash('删除失败：' + e.message))
}
</script>

<template>
  <div class="flex h-full flex-col">
    <ViewHeader icon="ph-sparkle" title="Agent 配置">{{ agName }}</ViewHeader>

    <div :class="['flex-1 overflow-auto', isMobile ? 'px-4 py-5' : 'px-6 py-[30px]']">
      <LoadingState v-if="loading" class="h-full" />
      <div v-else class="mx-auto flex max-w-[680px] flex-col gap-4">
        <!-- section 标签栏（in-content，替代旧中栏导航） -->
        <div class="flex flex-wrap gap-1 rounded-[10px] bg-[var(--mid)] p-[3px]">
          <button v-for="d in AGENT_DEFS" :key="d[0]" @click="section = d[0]" :style="`border:0;padding:7px 13px;border-radius:7px;cursor:pointer;font:${section===d[0]?'600':'500'} 12.5px/1 var(--font);${section===d[0]?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);'}`">{{ d[1] }}</button>
        </div>
        <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-[18px] shadow-md">
          <div class="text-[15px] font-semibold text-[var(--text)]" style="font-family: var(--display)">{{ agName }}</div>
          <div class="mt-1 text-[12.5px] font-medium leading-snug text-[var(--text3)]">{{ agDesc }}</div>
          <textarea
            :value="agValue"
            @change="onAgent"
            class="mt-[14px] block w-full min-h-[150px] resize-y rounded-[11px] border border-[var(--line2)] bg-[var(--bg)] px-[15px] py-[13px] text-sm font-medium leading-relaxed text-[var(--text)]"
            style="font-family: var(--font)"
          ></textarea>
          <!-- memory section：由记忆生成的自动规则 -->
          <template v-if="isMemorySection && autoRules.length">
            <div class="mt-[14px] border-t border-[var(--line)] pt-3">
              <div class="mb-[9px] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text3)]">自动化规则（由记忆生成）</div>
              <div v-for="r in autoRules" :key="r.id" class="flex items-center gap-[9px] border-b border-[var(--line)] py-2">
                <i class="ph ph-lightning text-[15px] text-[var(--idea)]"></i>
                <span class="flex-1 text-[13px] font-medium leading-snug text-[var(--text)]">新任务包含「{{ r.keyword }}」-> 自动邀请 {{ r.targetName }} 协作</span>
                <button @click="deleteRule(r.id)" title="删除规则" class="cursor-pointer border-0 bg-transparent p-[3px] text-[15px] text-[var(--text3)]"><i class="ph ph-trash"></i></button>
              </div>
            </div>
          </template>
        </div>
        <div class="flex items-center gap-3">
          <Button @click="saveAgent"><i class="ph ph-check"></i>保存</Button>
          <span class="text-xs font-medium leading-relaxed text-[var(--text3)]">修改后由 AI 在后续判断与追问中使用</span>
        </div>
      </div>
    </div>
  </div>
</template>
