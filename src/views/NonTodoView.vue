<script setup lang="ts">
// P3 第五个迁移视图：非 todo 隔离区。master-detail 自包含，与 ClarifyView 同模式。
// 挂载取 getState(nonTodoOutputs)，本地持有 nonTodos + selId。workspace/privacy 经 prop 传入
// （visible 过滤 + modeChip）。5 动作：转 todo / 复制 / 导出 Markdown / 归档 / 删除
// （归档与删除都走 nonDiscard，仅 toast 文案不同；与旧 App 一致）。toast 经 useToast。
import { ref, computed, onMounted, watch } from 'vue'
import { AppAPI } from '@/modules/app/api'
import { NonTodoAPI } from '@/modules/nontodo/api'
import { useToast } from '@/stores/toast'
import { lxFmtDue } from '@/shared/utils/format'
import Button from '@/components/ui/button/Button.vue'
import ViewHeader from '@/components/base/ViewHeader.vue'
import LoadingState from '@/components/base/LoadingState.vue'
import { useRoute } from 'vue-router'
import { usePane } from '@/shared/composables/usePane'
import { STORAGE_KEYS } from '@/shared/constants/storage-keys'
// 本视图跨 app/nontodo 两域：显式合并所需域 API（保持 api.xxx 调用语法，去 @/lib/api 依赖）
const api = { ...AppAPI, ...NonTodoAPI }

type Workspace = 'work' | 'personal'
type Scope = Workspace | 'mixed'
type Dest = 'copy' | 'export' | 'archive' | 'discard'
interface NonItem { id: string; title: string; text: string; raw: string; reason: string; dest: Dest; scope: Scope; gen: string }

const DEST_LABEL: Record<Dest, string> = { copy: '建议复制', export: '建议导出', archive: '建议归档', discard: '建议删除' }

const props = defineProps<{ workspace: Workspace; privacy: boolean; isMobile?: boolean }>()
const toast = useToast()
const route = useRoute()
const { width: leftW, startResize } = usePane({ key: STORAGE_KEYS.PANE_NONTODO, def: 280, max: 480 })
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

function mapNon(n: any): NonItem {
  return { id: n.id, title: n.title, text: n.summary || n.rawText, raw: n.rawText, reason: n.reason, dest: (n.suggestedDestination || 'archive') as Dest, scope: (n.privacyScope || 'work') as Scope, gen: n.createdAt || '' }
}

async function load() {
  loading.value = true
  try {
    const st = await api.getState()
    nonTodos.value = (((st as any).nonTodoOutputs || []) as any[]).map(mapNon)
    selId.value = typeof route.params.selId === 'string' ? route.params.selId : null
  } catch {
    toast.flash('加载隔离区失败，请刷新重试')
  } finally {
    loading.value = false
  }
}
onMounted(load)

function select(id: string) { selId.value = id }
watch(() => route.params.selId, (sid) => { selId.value = typeof sid === 'string' ? sid : null })

function nonConvert(id: string) {
  const n = nonTodos.value.find((x) => x.id === id)
  nonTodos.value = nonTodos.value.filter((x) => x.id !== id)
  selId.value = null
  api.nonToTodo(id).then(() => toast.flash('已转为 todo · 进入 Todo 数据库')).catch((e: any) => {
    if (n) nonTodos.value = [n, ...nonTodos.value]
    toast.flash('转换失败：' + e.message)
  })
}
function removeNon(id: string, msg: string) {
  const n = nonTodos.value.find((x) => x.id === id)
  nonTodos.value = nonTodos.value.filter((x) => x.id !== id)
  selId.value = null
  api.nonDiscard(id).then(() => toast.flash(msg)).catch((e: any) => {
    if (n) nonTodos.value = [n, ...nonTodos.value]
    toast.flash('操作失败：' + e.message)
  })
}
function copyNon() {
  const n = selNon.value
  if (!n) return
  const txt = n.raw || n.text || n.title
  const done = () => toast.flash('已复制到剪贴板')
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(() => toast.flash('复制失败'))
  } else {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy'); done() } catch { toast.flash('复制失败') }
    ta.remove()
  }
}
function exportNon() {
  const n = selNon.value
  if (!n) return
  const md = '# ' + n.title + '\n\n' + (n.text || '') + '\n\n---\n原始输入：' + (n.raw || '') + '\n\nAI 判断：' + (n.reason || '') + '\n导出于 ' + new Date().toLocaleString()
  const blob = new Blob([md], { type: 'text/markdown' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (n.title || 'non-todo').slice(0, 24) + '.md'
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  toast.flash('已导出 Markdown')
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 57px 头栏 -->
    <ViewHeader :show-back="isMobile && !!selId" @back="selId = null" icon="ph-tray" icon-color="var(--nono)" title="非 todo 隔离区">不参与任务与计划<template #trailing>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-[var(--mid)] px-[11px] py-1.5 text-xs font-semibold text-[var(--text2)]"><i :class="`ph ${modeIcon}`" style="font-size:13px;"></i>{{ modeLabel }}</span>
    </template></ViewHeader>

    <div class="flex min-h-0 flex-1">
      <!-- 列表 -->
      <div v-if="!isMobile || !selId" class="flex flex-col overflow-auto border-r border-[var(--line)] bg-[var(--panel)]" :style="isMobile ? 'flex:1;width:100%;' : `width:${leftW}px;flex:0 0 ${leftW}px;`">
        <LoadingState v-if="loading" class="flex-1" />
        <template v-else>
          <a v-for="n in visNons" :key="n.id" @click="select(n.id)" :class="['flex cursor-pointer flex-col gap-1 p-[11px_12px]', n.id === selNon?.id ? 'bg-[var(--accent-bg)]' : '']" data-hv="0">
            <span class="text-[13.5px] font-semibold leading-snug text-[var(--text)]">{{ n.title }}</span>
            <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-medium leading-snug text-[var(--text3)]">{{ n.text }}</span>
          </a>
          <div v-if="visNons.length === 0" class="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-[var(--text3)]">
            <i class="ph ph-tray text-[24px]"></i>
            <div class="text-xs font-medium">暂无隔离项</div>
          </div>
        </template>
      </div>

      <!-- 详情 -->
      <div v-if="!isMobile" @mousedown="startResize" title="拖动调整宽度" class="flex-none cursor-col-resize" style="width:5px;position:relative;z-index:6;"><div style="position:absolute;inset:0 2px;background:var(--line);"></div></div>
      <div v-if="!isMobile || !!selId" class="flex-1 overflow-auto px-6 py-[30px]">
        <div v-if="!loading && selNon" class="mx-auto flex max-w-[640px] flex-col gap-[18px]" style="animation: lx-pop .3s ease;">
          <div class="text-[22px] font-semibold leading-relaxed text-[var(--text2)]" style="font-family: var(--display)">{{ selNon.title }}</div>
          <div class="rounded-xl border border-dashed border-[var(--line2)] bg-[var(--nono-bg)] p-[14px_16px]">
            <div class="text-sm font-medium leading-relaxed text-[var(--text2)]">{{ selNon.text }}</div>
            <div class="mt-[9px] flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text3)]"><i class="ph ph-tray"></i>未进入 todo 主系统 · 已隔离保存</div>
          </div>
          <div class="rounded-xl bg-[var(--mid)] p-[13px_15px]">
            <div class="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text3)]"><i class="ph ph-quotes"></i>原始输入</div>
            <div class="mt-1.5 text-[13.5px] font-medium leading-relaxed text-[var(--text)]">{{ selNon.raw }}</div>
          </div>
          <div class="flex items-start gap-2 text-[12.5px] font-medium leading-relaxed text-[var(--text2)]"><i class="ph ph-sparkle mt-px text-[var(--accent-ink)]"></i><span>AI 判断为 <b class="text-[var(--nono)]">非 todo</b> · {{ selNon.reason }} · {{ cnDest }}</span></div>
          <div class="mt-0.5 flex flex-wrap items-center gap-2">
            <Button size="sm" @click="nonConvert(selNon.id)"><i class="ph ph-arrow-up-right"></i>转为 todo</Button>
            <Button variant="outline" size="sm" @click="copyNon">复制</Button>
            <Button variant="outline" size="sm" @click="exportNon">导出 Markdown</Button>
            <Button variant="outline" size="sm" @click="removeNon(selNon.id, '已归档')">归档</Button>
            <Button variant="outline" size="sm" class="border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-[var(--danger-bg)]" @click="removeNon(selNon.id, '已删除')">删除</Button>
          </div>
        </div>
        <div v-else-if="!loading" class="flex flex-col items-center justify-center gap-2.5 pt-[90px] text-[var(--text3)]">
          <i class="ph ph-tray text-[30px]"></i>
          <div class="text-[13px] font-medium">隔离区为空</div>
        </div>
      </div>
    </div>
  </div>
</template>
