<script setup lang="ts">
// P3 第四个迁移视图：待澄清区。master-detail 自包含--挂载取 getState(todoIdeas filter clarifying)，
// 本地持有 ideas + selId。workspace/privacy 经 prop 传入（用于 visible 过滤 + modeChip）。
// 旧 App 中栏 clarify 列表块移除、aside 对 clarify 隐藏（main 内 2 列：列表 | 详情）。
// convertIdea/discardIdea 乐观移除+失败回滚（与旧 App 一致）。toast 经 useToast。
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '@/lib/api'
import { useToast } from '@/stores/toast'
import { lxFmtDue } from '@/lib/format'
import Button from '@/components/ui/button/Button.vue'
import ViewHeader from '@/components/base/ViewHeader.vue'
import LoadingState from '@/components/base/LoadingState.vue'
import { useRoute } from 'vue-router'
import { usePane } from '@/shared/composables/usePane'
import { STORAGE_KEYS } from '@/shared/constants/storage-keys'

type Workspace = 'work' | 'personal'
type Scope = Workspace | 'mixed'
interface IdeaItem { id: string; title: string; raw: string; suggest: string; reason: string; scope: Scope; gen: string }

const props = defineProps<{ workspace: Workspace; privacy: boolean; isMobile?: boolean }>()
const toast = useToast()
const route = useRoute()
const { width: leftW, startResize } = usePane({ key: STORAGE_KEYS.PANE_CLARIFY, def: 280, max: 480 })
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

function mapIdea(i: any): IdeaItem {
  return { id: i.id, title: i.title, raw: i.rawText, suggest: i.suggestedNextAction, reason: i.aiReason, scope: (i.privacyScope || 'work') as Scope, gen: i.createdAt || '' }
}

async function load() {
  loading.value = true
  try {
    const st = await api.getState()
    ideas.value = (((st as any).todoIdeas || []) as any[]).filter((i) => i.status === 'clarifying').map(mapIdea)
    selId.value = typeof route.params.selId === 'string' ? route.params.selId : null
  } catch {
    toast.flash('加载待澄清区失败，请刷新重试')
  } finally {
    loading.value = false
  }
}
onMounted(load)

function select(id: string) { selId.value = id }
watch(() => route.params.selId, (sid) => { selId.value = typeof sid === 'string' ? sid : null })

function convertIdea(id: string) {
  const it = ideas.value.find((x) => x.id === id)
  ideas.value = ideas.value.filter((x) => x.id !== id)
  selId.value = null
  api.ideaConvert(id).then(() => toast.flash('已转为正式任务 · 进入 Todo 数据库')).catch((e: any) => {
    if (it) ideas.value = [it, ...ideas.value]
    toast.flash('转换失败：' + e.message)
  })
}
function discardIdea(id: string) {
  const it = ideas.value.find((x) => x.id === id)
  ideas.value = ideas.value.filter((x) => x.id !== id)
  selId.value = null
  api.ideaDiscard(id).then(() => toast.flash('已放弃该待澄清项')).catch((e: any) => {
    if (it) ideas.value = [it, ...ideas.value]
    toast.flash('操作失败：' + e.message)
  })
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 57px 头栏 -->
    <ViewHeader :show-back="isMobile && !!selId" @back="selId = null" icon="ph-lightbulb" title="待澄清区">补充后转为正式任务<template #trailing>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-[var(--mid)] px-[11px] py-1.5 text-xs font-semibold text-[var(--text2)]"><i :class="`ph ${modeIcon}`" style="font-size:13px;"></i>{{ modeLabel }}</span>
    </template></ViewHeader>

    <div class="flex min-h-0 flex-1">
      <!-- 列表 -->
      <div v-if="!isMobile || !selId" class="flex flex-col overflow-auto border-r border-[var(--line)] bg-[var(--panel)]" :style="isMobile ? 'flex:1;width:100%;' : `width:${leftW}px;flex:0 0 ${leftW}px;`">
        <LoadingState v-if="loading" class="flex-1" />
        <template v-else>
          <a v-for="i in visIdeas" :key="i.id" @click="select(i.id)" :class="['flex cursor-pointer flex-col gap-1 p-[11px_12px]', i.id === selIdea?.id ? 'bg-[var(--accent-bg)]' : '']" data-hv="0">
            <span class="text-[13.5px] font-semibold leading-snug text-[var(--text)]">{{ i.title }}</span>
            <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-medium leading-snug text-[var(--text3)]">{{ i.raw }}</span>
          </a>
          <div v-if="visIdeas.length === 0" class="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-[var(--text3)]">
            <i class="ph ph-lightbulb text-[24px]"></i>
            <div class="text-xs font-medium">暂无待澄清项</div>
          </div>
        </template>
      </div>

      <!-- 详情 -->
      <div v-if="!isMobile" @mousedown="startResize" title="拖动调整宽度" class="flex-none cursor-col-resize" style="width:5px;position:relative;z-index:6;"><div style="position:absolute;inset:0 2px;background:var(--line);"></div></div>
      <div v-if="!isMobile || !!selId" class="flex-1 overflow-auto px-6 py-[30px]">
        <div v-if="!loading && selIdea" class="mx-auto flex max-w-[640px] flex-col gap-[18px]" style="animation: lx-pop .3s ease;">
          <div class="text-[22px] font-semibold leading-relaxed text-[var(--text)]" style="font-family: var(--display)">{{ selIdea.title }}</div>
          <div class="rounded-xl border-l-[3px] border-[var(--idea)] bg-[var(--idea-bg)] p-[14px_16px]">
            <div class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--idea)]"><i class="ph ph-arrow-bend-down-right"></i>建议下一步</div>
            <div class="mt-2 text-sm font-medium leading-relaxed text-[var(--text)]">{{ selIdea.suggest }}</div>
          </div>
          <div class="rounded-xl bg-[var(--mid)] p-[13px_15px]">
            <div class="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text3)]"><i class="ph ph-quotes"></i>原始输入</div>
            <div class="mt-1.5 text-[13.5px] font-medium leading-relaxed text-[var(--text)]">{{ selIdea.raw }}</div>
          </div>
          <div class="flex items-start gap-2 text-[12.5px] font-medium leading-relaxed text-[var(--text2)]"><i class="ph ph-sparkle mt-px text-[var(--accent-ink)]"></i><span>AI 判断为 <b class="text-[var(--idea)]">待澄清</b> · {{ selIdea.reason }}</span></div>
          <div class="mt-0.5 flex items-center gap-2.5">
            <Button @click="convertIdea(selIdea.id)"><i class="ph ph-arrow-up-right"></i>转为正式任务</Button>
            <Button variant="outline" @click="discardIdea(selIdea.id)">放弃</Button>
            <div class="flex-1"></div>
            <span class="text-[11.5px] font-medium text-[var(--text3)]">生成于 {{ lxFmtDue(selIdea.gen) }}</span>
          </div>
        </div>
        <div v-else-if="!loading" class="flex flex-col items-center justify-center gap-2.5 pt-[90px] text-[var(--text3)]">
          <i class="ph ph-lightbulb text-[30px]"></i>
          <div class="text-[13px] font-medium">待澄清区为空</div>
        </div>
      </div>
    </div>
  </div>
</template>
