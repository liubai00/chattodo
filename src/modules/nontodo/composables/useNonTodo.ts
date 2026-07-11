// 非 todo 隔离域 composable：列表 + 选中 + 转 todo / 复制 / 导出 Markdown / 归档 / 删除。
// 归档与删除都走 nonDiscard（仅 toast 文案不同），与旧 App 一致。selId 跟随路由 params.selId。
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { AppAPI } from '@/modules/app/api'
import { NonTodoAPI } from '@/modules/nontodo/api'
import type { Workspace } from '@/shared/enums/workspace'

export type Scope = Workspace | 'mixed'
export type Dest = 'copy' | 'export' | 'archive' | 'discard'

export interface NonItem {
  id: string; title: string; text: string; raw: string
  reason: string; dest: Dest; scope: Scope; gen: string
}

export interface NonTodoProps {
  workspace: Workspace
  privacy: boolean
  isMobile?: boolean
}

const DEST_LABEL: Record<Dest, string> = { copy: '建议复制', export: '建议导出', archive: '建议归档', discard: '建议删除' }

interface NonRow {
  id: string; title: string
  summary?: string; rawText?: string; reason?: string
  suggestedDestination?: string; privacyScope?: string; createdAt?: string
}

interface NonState {
  nonTodoOutputs?: NonRow[]
  [k: string]: unknown
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : ''
}

export function useNonTodo(props: NonTodoProps, notify: (m: string) => void) {
  const route = useRoute()
  const loading = ref(true)
  const nonTodos = ref<NonItem[]>([])
  const selId = ref<string | null>(null)

  function visible(scope: Scope): boolean {
    return !props.privacy || scope === props.workspace || scope === 'mixed'
  }
  const visNons = computed(() => nonTodos.value.filter((n) => visible(n.scope)))
  const selNon = computed(() => visNons.value.find((n) => n.id === selId.value) || visNons.value[0] || null)
  const modeLabel = computed(() => (props.workspace === 'work' ? '工作' : '个人') + (props.privacy ? ' · 隐私' : ''))
  const modeIcon = computed(() => (props.privacy ? 'ph-lock-simple' : 'ph-briefcase'))
  const cnDest = computed(() => (selNon.value ? DEST_LABEL[selNon.value.dest] || '建议归档' : ''))

  function mapNon(n: NonRow): NonItem {
    return {
      id: n.id, title: n.title,
      text: n.summary || n.rawText || '', raw: n.rawText || '',
      reason: n.reason || '', dest: (n.suggestedDestination || 'archive') as Dest,
      scope: (n.privacyScope || 'work') as Scope, gen: n.createdAt || '',
    }
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      const st = await AppAPI.getState()
      const s = st as unknown as NonState
      nonTodos.value = (s.nonTodoOutputs || []).map(mapNon)
      selId.value = typeof route.params.selId === 'string' ? route.params.selId : null
    } catch {
      notify('加载隔离区失败，请刷新重试')
    } finally {
      loading.value = false
    }
  }
  onMounted(load)

  function select(id: string): void { selId.value = id }
  watch(() => route.params.selId, (sid) => { selId.value = typeof sid === 'string' ? sid : null })

  function nonConvert(id: string): void {
    const n = nonTodos.value.find((x) => x.id === id)
    nonTodos.value = nonTodos.value.filter((x) => x.id !== id)
    selId.value = null
    NonTodoAPI.nonToTodo(id)
      .then(() => notify('已转为 todo · 进入 Todo 数据库'))
      .catch((e: unknown) => { if (n) nonTodos.value = [n, ...nonTodos.value]; notify('转换失败：' + errMsg(e)) })
  }
  function removeNon(id: string, msg: string): void {
    const n = nonTodos.value.find((x) => x.id === id)
    nonTodos.value = nonTodos.value.filter((x) => x.id !== id)
    selId.value = null
    NonTodoAPI.nonDiscard(id)
      .then(() => notify(msg))
      .catch((e: unknown) => { if (n) nonTodos.value = [n, ...nonTodos.value]; notify('操作失败：' + errMsg(e)) })
  }
  function copyNon(): void {
    const n = selNon.value
    if (!n) return
    const txt = n.raw || n.text || n.title
    const done = () => notify('已复制到剪贴板')
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(() => notify('复制失败'))
    } else {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); done() } catch { notify('复制失败') }
      ta.remove()
    }
  }
  function exportNon(): void {
    const n = selNon.value
    if (!n) return
    const md = '# ' + n.title + '\n\n' + (n.text || '') + '\n\n---\n原始输入：' + (n.raw || '') + '\n\nAI 判断：' + (n.reason || '') + '\n导出于 ' + new Date().toLocaleString()
    const blob = new Blob([md], { type: 'text/markdown' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (n.title || 'non-todo').slice(0, 24) + '.md'
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    notify('已导出 Markdown')
  }

  return { loading, visNons, selNon, selId, modeLabel, modeIcon, cnDest, select, nonConvert, removeNon, copyNon, exportNon }
}
