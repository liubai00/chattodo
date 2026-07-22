<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BaserowAPI, parseTaskRef, type TaskRef, type TaskSpace } from '@/modules/baserow/api'
import type { RequestError } from '@/infrastructure/request'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/ui/button/Button.vue'

interface Props {
  isMobile?: boolean
  workspace?: 'work' | 'personal'
  privacy?: boolean
  openTask?: (id: string) => void
}

const props = withDefaults(defineProps<Props>(), {
  isMobile: false,
  workspace: 'work',
  privacy: false,
  openTask: () => undefined,
})
const LegacyDatabaseView = defineAsyncComponent(() => import('@/views/LegacyDatabaseView.vue'))
const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const frame = ref<HTMLIFrameElement | null>(null)
const launchUrl = ref('')
const baserowOrigin = ref('')
const loading = ref(false)
const error = ref('')
const authenticated = ref(false)
const legacyMode = ref(false)
let launchGeneration = 0
let automaticRetries = 0

const routeRef = computed<TaskRef | null>(() => parseTaskRef(route.query.ref))
const space = computed<TaskSpace>(() => {
  const fromRoute = route.params.space
  if (fromRoute === 'team' || fromRoute === 'personal') return fromRoute
  if (routeRef.value) return routeRef.value.space
  return props.workspace === 'personal' ? 'personal' : 'team'
})

function postToBaserow(message: Record<string, unknown>) {
  if (!frame.value?.contentWindow || !baserowOrigin.value) return
  frame.value.contentWindow.postMessage(message, baserowOrigin.value)
}

function syncTheme() {
  postToBaserow({ type: 'linx:theme', theme: ui.theme })
}

function openRequestedRow() {
  const ref = routeRef.value
  if (ref) postToBaserow({ type: 'linx:open-row', ref })
}

async function launch() {
  const generation = ++launchGeneration
  loading.value = !props.isMobile
  error.value = ''
  authenticated.value = false
  launchUrl.value = ''
  try {
    const status = await BaserowAPI.status()
    if (!status.enabled) {
      legacyMode.value = true
      loading.value = false
      return
    }
    if (props.isMobile) {
      loading.value = false
      return
    }
    if (!status.healthy) throw new Error('Baserow 服务暂时不可用')
    const session = await BaserowAPI.session(space.value)
    if (generation !== launchGeneration) return
    baserowOrigin.value = new URL(session.launchUrl).origin
    launchUrl.value = session.launchUrl
  } catch (cause) {
    if (generation !== launchGeneration) return
    if ((cause as Partial<RequestError>)?.status === 404) {
      legacyMode.value = true
      loading.value = false
      return
    }
    error.value = cause instanceof Error ? cause.message : 'Todo 数据库连接失败'
    loading.value = false
  }
}

function selectSpace(next: TaskSpace) {
  if (next === space.value && !route.query.ref) return
  void router.replace({
    name: 'database',
    params: { space: next },
    query: {},
  })
}

function onMessage(event: MessageEvent) {
  if (!baserowOrigin.value || event.origin !== baserowOrigin.value) return
  if (event.source !== frame.value?.contentWindow) return
  const message = event.data || {}
  if (message.type === 'linx:baserow-ready') {
    syncTheme()
    return
  }
  if (message.type === 'linx:baserow-authenticated') {
    authenticated.value = true
    loading.value = false
    automaticRetries = 0
    nextTick(openRequestedRow)
    return
  }
  if (message.type === 'linx:baserow-session-expired') {
    if (automaticRetries < 2) {
      automaticRetries += 1
      void launch()
    } else {
      loading.value = false
      error.value = '数据库会话已过期，请点击重试。'
    }
    return
  }
  if (message.type === 'linx:baserow-session-error') {
    loading.value = false
    error.value = String(message.message || 'Todo 数据库登录失败')
  }
}

watch(space, () => {
  automaticRetries = 0
  void launch()
})
watch(() => ui.theme, syncTheme)
watch(() => route.query.ref, () => {
  if (authenticated.value) openRequestedRow()
})
watch(() => props.isMobile, (isMobile) => {
  if (legacyMode.value) return
  if (isMobile) {
    launchGeneration += 1
    launchUrl.value = ''
    authenticated.value = false
  } else {
    void launch()
  }
})

onMounted(() => {
  window.addEventListener('message', onMessage)
  void launch()
})
onBeforeUnmount(() => {
  launchGeneration += 1
  postToBaserow({ type: 'linx:session-close' })
  window.removeEventListener('message', onMessage)
})
</script>

<template>
  <LegacyDatabaseView
    v-if="legacyMode"
    :is-mobile="isMobile"
    :workspace="workspace"
    :privacy="privacy"
    :open-task="openTask"
  />
  <section v-else class="flex h-full min-h-0 flex-col bg-[var(--panel)]">
    <div class="flex h-[50px] flex-none items-center gap-3 border-b border-[var(--line)] px-4">
      <div class="flex min-w-0 items-center gap-2">
        <i class="ph ph-table text-[18px] text-[var(--accent-ink)]"></i>
        <span class="truncate text-sm font-semibold text-[var(--text)]">Todo 数据库</span>
      </div>
      <div class="ml-2 inline-flex rounded-[9px] bg-[var(--mid)] p-[3px]">
        <button
          v-for="item in ([['team', '团队任务'], ['personal', '个人任务']] as const)"
          :key="item[0]"
          type="button"
          class="rounded-[7px] border-0 px-3 py-1.5 text-xs font-semibold transition-colors"
          :class="space === item[0] ? 'bg-[var(--panel)] text-[var(--text)] shadow-sm' : 'bg-transparent text-[var(--text2)]'"
          @click="selectSpace(item[0])"
        >{{ item[1] }}</button>
      </div>
      <div class="flex-1"></div>
      <span class="hidden text-[11.5px] font-medium text-[var(--text3)] lg:inline">列、筛选、排序与视图由所有成员共享</span>
    </div>

    <div v-if="isMobile" class="flex flex-1 items-center justify-center p-8 text-center">
      <div class="max-w-[360px]">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-bg)] text-2xl text-[var(--accent-ink)]"><i class="ph ph-desktop"></i></div>
        <h2 class="text-base font-semibold text-[var(--text)]">首版请在电脑端使用 Todo 数据库</h2>
        <p class="mt-2 text-[13px] font-medium leading-relaxed text-[var(--text3)]">聊天和提醒仍可在手机上使用；可编辑多维表格将在后续版本适配移动端。</p>
      </div>
    </div>

    <div v-else class="relative min-h-0 flex-1 bg-[var(--bg)]">
      <iframe
        v-if="launchUrl"
        ref="frame"
        :key="launchUrl"
        :src="launchUrl"
        class="absolute inset-0 h-full w-full border-0 bg-[var(--panel)]"
        title="LinX Todo 数据库"
        sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-popups allow-downloads"
        allow="clipboard-read; clipboard-write"
        referrerpolicy="origin"
        @load="syncTheme"
      />

      <div v-if="loading" class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[var(--panel)]/90">
        <div class="flex items-center gap-2.5 text-[13px] font-semibold text-[var(--text2)]">
          <i class="ph ph-spinner-gap animate-spin text-lg text-[var(--accent-ink)]"></i>
          正在安全连接 Baserow…
        </div>
      </div>

      <div v-if="error" class="absolute inset-0 z-20 flex items-center justify-center bg-[var(--panel)] p-6 text-center">
        <div class="max-w-[420px]">
          <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--danger-bg)] text-xl text-[var(--danger)]"><i class="ph ph-warning-circle"></i></div>
          <h2 class="text-base font-semibold text-[var(--text)]">Todo 数据库暂时无法打开</h2>
          <p class="my-2 text-[13px] font-medium leading-relaxed text-[var(--text3)]">{{ error }}</p>
          <Button class="mt-3 h-9 rounded-[9px] px-4 text-xs font-semibold" @click="automaticRetries = 0; launch()">重新连接</Button>
        </div>
      </div>
    </div>
  </section>
</template>
