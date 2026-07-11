// 待澄清域 composable：想法列表（clarifying 过滤）+ 选中 + 转任务 / 放弃（乐观移除 + 失败回滚）。
// notify 回调把文案交回视图层。selId 跟随路由 params.selId。
import { ref, computed, watch } from 'vue'
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { AppAPI } from '@/modules/app/api'
import { ClarifyAPI } from '@/modules/clarify/api'
import type { Workspace } from '@/shared/enums/workspace'

export type Scope = Workspace | 'mixed'

export interface IdeaItem {
  id: string; title: string; raw: string; suggest: string
  reason: string; scope: Scope; gen: string
}

export interface ClarifyProps {
  workspace: Workspace
  privacy: boolean
  isMobile?: boolean
}

interface ClarifyIdeaRow {
  id: string; title: string
  rawText?: string; suggestedNextAction?: string; aiReason?: string
  privacyScope?: string; status?: string; createdAt?: string
}

interface ClarifyState {
  todoIdeas?: ClarifyIdeaRow[]
  [k: string]: unknown
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : ''
}

export function useClarify(props: ClarifyProps, notify: (m: string) => void) {
  const route = useRoute()
  const loading = ref(true)
  const ideas = ref<IdeaItem[]>([])
  const selId = ref<string | null>(null)

  function visible(scope: Scope): boolean {
    return !props.privacy || scope === props.workspace || scope === 'mixed'
  }
  const visIdeas = computed(() => ideas.value.filter((i) => visible(i.scope)))
  const selIdea = computed(() => visIdeas.value.find((i) => i.id === selId.value) || visIdeas.value[0] || null)
  const modeLabel = computed(() => (props.workspace === 'work' ? '工作' : '个人') + (props.privacy ? ' · 隐私' : ''))
  const modeIcon = computed(() => (props.privacy ? 'ph-lock-simple' : 'ph-briefcase'))

  function mapIdea(i: ClarifyIdeaRow): IdeaItem {
    return {
      id: i.id, title: i.title, raw: i.rawText || '',
      suggest: i.suggestedNextAction || '', reason: i.aiReason || '',
      scope: (i.privacyScope || 'work') as Scope, gen: i.createdAt || '',
    }
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      const st = await AppAPI.getState()
      const s = st as unknown as ClarifyState
      ideas.value = (s.todoIdeas || []).filter((i) => i.status === 'clarifying').map(mapIdea)
      selId.value = typeof route.params.selId === 'string' ? route.params.selId : null
    } catch {
      notify('加载待澄清区失败，请刷新重试')
    } finally {
      loading.value = false
    }
  }
  onMounted(load)

  function select(id: string): void { selId.value = id }
  watch(() => route.params.selId, (sid) => { selId.value = typeof sid === 'string' ? sid : null })

  function convertIdea(id: string): void {
    const it = ideas.value.find((x) => x.id === id)
    ideas.value = ideas.value.filter((x) => x.id !== id)
    selId.value = null
    ClarifyAPI.ideaConvert(id)
      .then(() => notify('已转为正式任务 · 进入 Todo 数据库'))
      .catch((e: unknown) => { if (it) ideas.value = [it, ...ideas.value]; notify('转换失败：' + errMsg(e)) })
  }
  function discardIdea(id: string): void {
    const it = ideas.value.find((x) => x.id === id)
    ideas.value = ideas.value.filter((x) => x.id !== id)
    selId.value = null
    ClarifyAPI.ideaDiscard(id)
      .then(() => notify('已放弃该待澄清项'))
      .catch((e: unknown) => { if (it) ideas.value = [it, ...ideas.value]; notify('操作失败：' + errMsg(e)) })
  }

  return { loading, visIdeas, selIdea, selId, modeLabel, modeIcon, select, convertIdea, discardIdea }
}
