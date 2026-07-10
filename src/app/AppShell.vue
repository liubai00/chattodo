<script setup lang="ts">
// P4c-step2：新应用壳(TS)。替代 legacy App.vue 的壳职能。
// 用 auth/ui/events store；登录屏(未authed) + rail(nav+theme+avatar+logout) + 视图switch(按route.name) + toast + TaskDetailView。
// 暂缓(记为 gap，路由可逆、legacy 留 fallback)：通知面板/搜索⌘K/快捷键/移动端布局/pane 拖拽。
// chat 的 openIdea/openNon 暂只导航不深选(跨视图选择 gap)。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useEventsStore } from '@/stores/events'
import { useToast } from '@/stores/toast'
import { applyTheme } from '@/lib/theme'
import ChatView from '@/app/views/ChatView.vue'
import DatabaseView from '@/app/views/DatabaseView.vue'
import ProjectsView from '@/app/views/ProjectsView.vue'
import FriendsView from '@/app/views/FriendsView.vue'
import ClarifyView from '@/app/views/ClarifyView.vue'
import NonTodoView from '@/app/views/NonTodoView.vue'
import AgentView from '@/app/views/AgentView.vue'
import SettingsView from '@/app/views/SettingsView.vue'
import TaskDetailView from '@/app/views/TaskDetailView.vue'

const auth = useAuthStore()
const ui = useUiStore()
const events = useEventsStore()
const toast = useToast()
const router = useRouter()
const route = useRoute()

const authMode = ref<'login' | 'register'>('login')
const authName = ref(''); const authEmail = ref(''); const authPassword = ref(''); const authError = ref(''); const authBusy = ref(false)
const booting = ref(true)

const view = computed(() => route.name as string)
const meBig = computed(() => (auth.user.name || '我').slice(-1))
const adminUrl = computed(() => (import.meta.env.BASE_URL || '/') + 'admin/')

const NAV: Array<[string, string, string]> = [
  ['chat', '聊天', 'ph-chat-circle'], ['database', 'Todo 数据库', 'ph-table'], ['projects', '项目', 'ph-folders'],
  ['friends', '好友', 'ph-users'], ['clarify', '待澄清区', 'ph-lightbulb'], ['nontodo', '非 todo 隔离区', 'ph-tray'],
  ['agent', 'Agent 配置', 'ph-sparkle'], ['settings', '设置', 'ph-gear'],
]

// 视图回调（从 store）
const openTask = (id: string) => ui.openTask(id)
const openIdea = (_id: string) => router.push({ name: 'clarify' })   // 暂只导航，不深选(gap)
const openNon = (_id: string) => router.push({ name: 'nontodo' })
const afterSend = () => ui.load()   // 刷新壳状态；视图自身按需 remount 刷新

function go(v: string) { router.push({ name: v }) }
async function submitAuth() {
  const email = authEmail.value.trim(); const pw = authPassword.value; const name = authName.value.trim()
  if (authMode.value === 'register' && !name) { authError.value = '请输入显示名称'; return }
  if (!email) { authError.value = '请输入邮箱'; return }
  if (!pw) { authError.value = '请输入密码'; return }
  authError.value = ''; authBusy.value = true
  try {
    if (authMode.value === 'register') await auth.register(name, email, pw)
    else await auth.login(email, pw)
    await ui.load(); events.connect(); subscribeEvents()
    router.push({ name: 'chat' })
    toast.flash(authMode.value === 'register' ? '注册成功 · 欢迎使用' : '欢迎回来')
  } catch (e: any) { authError.value = (e && e.message) || '请求失败，请稍后再试' }
  finally { authBusy.value = false }
}
async function logout() { events.disconnect(); await auth.logout(); router.push({ name: 'home' }) }

// 事件订阅：notify->toast + 节流 ui.load（刷新壳状态）
let _evtTimer: ReturnType<typeof setTimeout> | null = null
let _unsub: (() => void) | null = null
function subscribeEvents() {
  if (_unsub) return
  _unsub = events.subscribe((e: any) => {
    if (e.kind === 'notify' && e.text) toast.flash('🔔 ' + String(e.text).slice(0, 46))
    const now = Date.now()
    if (!_evtTimer) { _evtTimer = setTimeout(() => { _evtTimer = null; ui.load() }, 2600) }
  })
}

onMounted(async () => {
  await auth.init()
  if (auth.authed) {
    await ui.load(); applyTheme(ui.theme); events.connect(); subscribeEvents()
  }
  booting.value = false
})
onBeforeUnmount(() => { if (_unsub) _unsub() })
</script>

<template>
  <div id="lx-root" class="flex h-screen w-full overflow-hidden" style="background:var(--bg);color:var(--text);font-family:var(--font);">
    <!-- 启动中 -->
    <div v-if="booting" class="flex h-full w-full items-center justify-center text-[var(--text3)]">加载中…</div>

    <!-- 登录屏 -->
    <div v-else-if="!auth.authed" class="flex h-full w-full items-center justify-center p-6" style="background:radial-gradient(120% 90% at 50% 0%, var(--surface-base) 0%, var(--bg) 60%);">
      <div class="flex w-[400px] max-w-full flex-col gap-[22px]" style="animation:lx-pop .4s ease;">
        <div class="flex flex-col items-center gap-[14px]">
          <div class="flex h-[52px] w-[52px] items-center justify-center rounded-[15px] bg-[var(--accent)] text-[26px] font-semibold text-[var(--accent-contrast)]" style="font-family:var(--display);box-shadow:var(--shadow-md);">灵</div>
          <div class="text-center"><div class="text-[24px] font-semibold text-[var(--text)]" style="font-family:var(--display);">登录 LinX 灵信</div><div class="mt-[5px] text-[13.5px] font-medium text-[var(--text3)]">AI 原生 todo · 内部测试版</div></div>
        </div>
        <div class="flex flex-col gap-[14px] rounded-[18px] border border-[var(--line)] bg-[var(--panel)] p-6" style="box-shadow:var(--shadow);">
          <label v-if="authMode === 'register'" class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">显示名称</span><input v-model="authName" placeholder="你的名字" class="rounded-[10px] border border-[var(--line2)] bg-[var(--bg)] px-[13px] py-[11px] text-sm font-medium text-[var(--text)]" /></label>
          <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">邮箱</span><input v-model="authEmail" @keydown.enter="submitAuth" type="email" placeholder="you@team.com" class="rounded-[10px] border border-[var(--line2)] bg-[var(--bg)] px-[13px] py-[11px] text-sm font-medium text-[var(--text)]" /></label>
          <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">密码</span><input v-model="authPassword" @keydown.enter="submitAuth" type="password" :placeholder="authMode==='register'?'至少 8 位':'输入密码'" class="rounded-[10px] border border-[var(--line2)] bg-[var(--bg)] px-[13px] py-[11px] text-sm font-medium text-[var(--text)]" /></label>
          <div v-if="authError" class="rounded-[9px] bg-[var(--danger-bg)] px-3 py-[9px] text-[12.5px] font-medium text-[var(--danger)]">{{ authError }}</div>
          <button @click="submitAuth" :disabled="authBusy" class="mt-1 flex h-11 items-center justify-center gap-[7px] rounded-[11px] bg-[var(--accent)] text-[14.5px] font-semibold text-[var(--accent-contrast)]" style="border:0;cursor:pointer;box-shadow:var(--shadow);">{{ authBusy ? '请稍候…' : (authMode === 'register' ? '注册并进入' : '登录') }} <i class="ph ph-arrow-right"></i></button>
          <div class="text-center text-[12.5px] font-medium text-[var(--text3)]">{{ authMode === 'register' ? '已有账号？' : '还没有账号？' }}<span @click="authMode = authMode === 'register' ? 'login' : 'register'" class="ml-[5px] cursor-pointer font-semibold text-[var(--accent-ink)]">{{ authMode === 'register' ? '去登录' : '注册新账号' }}</span></div>
        </div>
        <div class="text-center text-xs font-medium leading-relaxed text-[var(--text3)]">你的数据仅自己可见 · 首个注册账号为管理员</div>
      </div>
    </div>

    <!-- 壳：rail + 视图区 -->
    <template v-else>
      <nav class="flex flex-none flex-col items-center gap-[6px] bg-[var(--rail)] px-[9px] py-3" style="width:64px;">
        <div class="mb-2 flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-[var(--accent)] text-[19px] font-semibold text-[var(--accent-contrast)]" style="font-family:var(--display);box-shadow:var(--shadow);">灵</div>
        <a v-for="n in NAV" :key="n[0]" @click="go(n[0])" :title="n[1]" class="flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-[12px] text-[22px]" :style="view===n[0]?'background:var(--accent-bg);color:var(--accent-ink);':'color:var(--text2);background:transparent;'" data-hv="0"><i :class="`ph ${n[2]}`"></i></a>
        <div class="flex-1"></div>
        <a v-if="auth.canAdmin" :href="adminUrl" title="监控后台" class="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] text-[22px] text-[var(--text2)]" style="text-decoration:none;" data-hv="0"><i class="ph ph-chart-line-up"></i></a>
        <button @click="ui.toggleTheme()" :title="ui.theme==='dark'?'切换明亮':'切换深色'" class="mt-1 flex h-[38px] w-[38px] items-center justify-center rounded-[11px] text-[18px] text-[var(--text2)]" style="border:0;background:transparent;cursor:pointer;" data-hv="0"><i :class="`ph ${ui.theme==='dark'?'ph-sun':'ph-moon'}`"></i></button>
        <div :title="auth.user.name" class="mt-1.5 flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full bg-[var(--surface-active)] text-[13px] font-semibold text-[var(--text-secondary)]" @click="go('settings')">{{ meBig }}</div>
        <button @click="logout" title="退出登录" class="mt-1 flex h-[34px] w-[34px] items-center justify-center rounded-full text-[15px] text-[var(--text3)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-sign-out"></i></button>
      </nav>

      <div class="relative flex min-w-0 flex-1">
        <ChatView v-if="view==='chat'" :workspace="ui.workspace" :privacy="ui.privacy" :openTask="openTask" :openIdea="openIdea" :openNon="openNon" :afterSend="afterSend" :setWorkspace="ui.setWorkspace" :togglePrivacy="ui.togglePrivacy" />
        <DatabaseView v-else-if="view==='database'" :workspace="ui.workspace" :privacy="ui.privacy" :openTask="openTask" />
        <ProjectsView v-else-if="view==='projects'" :workspace="ui.workspace" :privacy="ui.privacy" :openTask="openTask" />
        <FriendsView v-else-if="view==='friends'" />
        <ClarifyView v-else-if="view==='clarify'" :workspace="ui.workspace" :privacy="ui.privacy" />
        <NonTodoView v-else-if="view==='nontodo'" :workspace="ui.workspace" :privacy="ui.privacy" />
        <AgentView v-else-if="view==='agent'" />
        <SettingsView v-else-if="view==='settings'" />
        <div v-else class="flex flex-1 items-center justify-center text-[var(--text3)]">未知视图</div>

        <!-- 任务详情浮层 -->
        <TaskDetailView v-if="ui.detailId" :taskId="ui.detailId" :afterChange="afterSend" @close="ui.closeDetail()" />
      </div>
    </template>

    <!-- toast（全局，读 useToast store） -->
    <div v-if="toast.msg" style="position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;background:var(--text);color:var(--bg);padding:11px 18px;border-radius:12px;font:600 13px/1 var(--font);box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:8px;animation:lx-pop .25s ease;"><i class="ph ph-check-circle"></i>{{ toast.msg }}</div>
  </div>
</template>
