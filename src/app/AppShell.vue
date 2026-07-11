<script setup lang="ts">
// P4c-step2：新应用壳(TS)。替代 legacy App.vue 的壳职能。
// 用 auth/ui/events store；登录屏(未authed) + rail(nav+theme+avatar+logout) + 视图switch(按route.name) + toast + TaskDetailView。
// 暂缓(记为 gap，路由可逆、legacy 留 fallback)：通知面板/搜索⌘K/快捷键/移动端布局/pane 拖拽。
// openIdea/openNon/搜索结果 经路由参数 :selId 深选(跨视图选中 idea/non/project)。
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, defineAsyncComponent } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useEventsStore } from '@/stores/events'
import { useToast } from '@/stores/toast'
import { TasksAPI } from '@/modules/tasks/api'
import { FriendsAPI } from '@/modules/friends/api'
import { AppAPI } from '@/modules/app/api'
import type { ServerEvent } from '@/modules/chat/api'
import type { Notification, SearchResult } from '@/types/api'
import { lxFmtDue } from '@/shared/utils/format'
import { applyTheme } from '@/shared/utils/theme'
import { cn } from '@/shared/utils/cn'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import Card from '@/components/ui/card/Card.vue'
import { Tooltip, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import IconButton from '@/components/base/IconButton.vue'
// AppShell 跨 tasks/friends/app 三域：显式合并所需域 API（保持 api.xxx 调用语法，import 来自 modules）。
const api = { ...TasksAPI, ...FriendsAPI, ...AppAPI }
// 首屏视图（#/chat 为默认路由）保持同步 import；其余视图懒加载以拆分构建产物。
import ChatView from '@/views/ChatView.vue'
const DatabaseView = defineAsyncComponent(() => import('@/views/DatabaseView.vue'))
const ProjectsView = defineAsyncComponent(() => import('@/views/ProjectsView.vue'))
const FriendsView = defineAsyncComponent(() => import('@/views/FriendsView.vue'))
const ClarifyView = defineAsyncComponent(() => import('@/views/ClarifyView.vue'))
const NonTodoView = defineAsyncComponent(() => import('@/views/NonTodoView.vue'))
const AgentView = defineAsyncComponent(() => import('@/views/AgentView.vue'))
const SettingsView = defineAsyncComponent(() => import('@/views/SettingsView.vue'))
const TaskDetailView = defineAsyncComponent(() => import('@/views/TaskDetailView.vue'))

const auth = useAuthStore()
const ui = useUiStore()
const events = useEventsStore()
const toast = useToast()
const router = useRouter()
const route = useRoute()

const authMode = ref<'login' | 'register'>('login')
const authName = ref(''); const authEmail = ref(''); const authPassword = ref(''); const authError = ref(''); const authBusy = ref(false)
const booting = ref(true)

// 命令面板条目（导航项 / 搜索结果统一形状）。
interface PaletteItem { icon: string; label: string; subtitle?: string; run: () => void }

const view = computed(() => route.name as string)
const meBig = computed(() => (auth.user.name || '我').slice(-1))
const adminUrl = computed(() => (import.meta.env.BASE_URL || '/') + 'admin/')

// 通知
const unread = computed(() => ui.notifs.filter((n) => !n.read).length)
const hasUnread = computed(() => unread.value > 0)
const notifList = computed(() => ui.notifs.map((n: Notification) => ({
  ...n, icon: n.icon || 'ph-bell', color: n.color || 'var(--accent-ink)', time: lxFmtDue(n.createdAt),
  isInvite: n.actionType === 'invite', isFriendReq: n.actionType === 'friend_request',
  wasInvite: n.actionType === 'invite' && n.handled, wasFriendReq: n.actionType === 'friend_request' && n.handled,
  dot: n.read ? 'var(--text3)' : 'var(--accent)',
})))
async function acceptInvite(r: string | undefined) { await api.respondInvite(r || '', 'accept', true).catch(() => {}); ui.loadNotifs(); toast.flash('已加入协作') }
async function followInvite(r: string | undefined) { await api.respondInvite(r || '', 'follow').catch(() => {}); ui.loadNotifs(); toast.flash('已关注 · 进展会通知你') }
async function declineInvite(r: string | undefined) { await api.respondInvite(r || '', 'decline').catch(() => {}); ui.loadNotifs(); toast.flash('已婉拒') }
async function acceptFriend(r: string | undefined) { await api.friendRespond(r || '', true).catch(() => {}); ui.loadNotifs(); toast.flash('已成为好友') }
async function declineFriend(r: string | undefined) { await api.friendRespond(r || '', false).catch(() => {}); ui.loadNotifs(); toast.flash('已拒绝') }

// 搜索 ⌘K
const searchResults = ref<SearchResult[]>([])
const searchInput = ref<HTMLInputElement | null>(null)
let _searchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => ui.searchQuery, (q) => {
  if (_searchTimer) clearTimeout(_searchTimer)
  if (!(q || '').trim()) { searchResults.value = []; return }
  _searchTimer = setTimeout(async () => { try { searchResults.value = await api.search(q.trim()) } catch { searchResults.value = [] } }, 250)
})
watch(() => ui.searchOpen, (open) => { if (open) nextTick(() => searchInput.value?.focus()) })
const SEARCH_LABELS: Record<string, string> = { task: '任务', idea: '待澄清', nono: '非 todo', project: '项目' }
const paletteGroups = computed(() => {
  const groups: Array<{ name: string; items: PaletteItem[] }> = []
  if (!ui.searchQuery) groups.push({ name: '前往', items: NAV.map(([k, n, ic]) => ({ icon: ic, label: `前往 · ${n}`, run: () => { go(k); ui.searchQuery = ''; ui.closeSearch() } })) })
  if (searchResults.value.length) {
    const byType: Record<string, SearchResult[]> = {}
    for (const r of searchResults.value) { const t = r.type || 'other'; (byType[t] ||= []).push(r) }
    for (const t of Object.keys(byType)) groups.push({ name: SEARCH_LABELS[t] || t, items: byType[t].map((r) => ({ icon: r.icon || 'ph-at', label: r.title || '', subtitle: r.subtitle || '', run: () => { executeSearch(r); ui.searchQuery = ''; ui.closeSearch() } })) })
  }
  return groups
})
function executeSearch(r: SearchResult) {
  if (r.type === 'task') openTask(r.id)
  else if (r.type === 'idea') router.push({ name: 'clarify', params: { selId: r.id } })
  else if (r.type === 'nono') router.push({ name: 'nontodo', params: { selId: r.id } })
  else if (r.type === 'project') router.push({ name: 'projects', params: { selId: r.id } })
}
function flatIndex(gi: number, ii: number): number { let n = 0; for (let i = 0; i < gi; i++) n += paletteGroups.value[i].items.length; return n + ii }
function paletteKey(e: KeyboardEvent) {
  const items = paletteGroups.value.flatMap((g) => g.items)
  if (e.key === 'ArrowDown') { e.preventDefault(); ui.paletteIndex = Math.min((ui.paletteIndex || 0) + 1, Math.max(0, items.length - 1)); return }
  if (e.key === 'ArrowUp') { e.preventDefault(); ui.paletteIndex = Math.max((ui.paletteIndex || 0) - 1, 0); return }
  if (e.key === 'Enter') { e.preventDefault(); const it = items[ui.paletteIndex || 0] || items[0]; if (it) it.run() }
}
let _gPending = false
let _gTimer: ReturnType<typeof setTimeout> | null = null
function onGlobalKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName || ''
  const inInput = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || ui.searchOpen || ui.shortcutsOpen
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopPropagation(); ui.openSearch(); return }
  if (inInput) return
  if (e.key === '?') { e.preventDefault(); ui.toggleShortcuts(); return }
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); go('chat'); setTimeout(() => document.getElementById('lx-composer')?.focus(), 80); return }
  const k = (e.key || '').toLowerCase()
  if (_gPending) { _gPending = false; if (_gTimer) clearTimeout(_gTimer); const map: Record<string, string> = { c: 'chat', d: 'database', p: 'projects', f: 'friends', s: 'settings', l: 'clarify', a: 'agent', t: 'nontodo' }; if (map[k]) { e.preventDefault(); go(map[k]) } return }
  if (k === 'g') { _gPending = true; if (_gTimer) clearTimeout(_gTimer); _gTimer = setTimeout(() => { _gPending = false }, 900) }
}
function onResize() { ui.setMobile(window.innerWidth < 820) }

const NAV: Array<[string, string, string]> = [
  ['chat', '聊天', 'ph-chat-circle'], ['database', 'Todo 数据库', 'ph-table'], ['projects', '项目', 'ph-folders'],
  ['friends', '好友', 'ph-users'], ['clarify', '待澄清区', 'ph-lightbulb'], ['nontodo', '非 todo 隔离区', 'ph-tray'],
  ['agent', 'Agent 配置', 'ph-sparkle'], ['settings', '设置', 'ph-gear'],
]

// 视图回调（从 store）
const openTask = (id: string) => ui.openTask(id)
const openIdea = (id: string) => router.push({ name: 'clarify', params: { selId: id } })
const openNon = (id: string) => router.push({ name: 'nontodo', params: { selId: id } })
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
    await ui.load(); ui.loadNotifs(); events.connect(); subscribeEvents()
    router.push({ name: 'chat' })
    toast.flash(authMode.value === 'register' ? '注册成功 · 欢迎使用' : '欢迎回来')
  } catch (e: unknown) { authError.value = (e instanceof Error ? e.message : '') || '请求失败，请稍后再试' }
  finally { authBusy.value = false }
}
async function logout() { events.disconnect(); await auth.logout(); router.push({ name: 'home' }) }

// 事件订阅：notify->toast + 节流 ui.load（刷新壳状态）
let _evtTimer: ReturnType<typeof setTimeout> | null = null
let _unsub: (() => void) | null = null
function subscribeEvents() {
  if (_unsub) return
  _unsub = events.subscribe((e: ServerEvent) => {
    if (e.kind === 'notify' && e.text) toast.flash('🔔 ' + String(e.text).slice(0, 46))
    if (!_evtTimer) { _evtTimer = setTimeout(() => { _evtTimer = null; ui.load(); ui.loadNotifs() }, 2600) }
  })
}

onMounted(async () => {
  await auth.init()
  if (auth.authed) {
    await ui.load(); applyTheme(ui.theme); ui.loadNotifs(); events.connect(); subscribeEvents()
  }
  booting.value = false
  onResize()
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onGlobalKey, true)
})
onBeforeUnmount(() => { if (_unsub) _unsub(); window.removeEventListener('keydown', onGlobalKey, true); window.removeEventListener('resize', onResize) })
</script>

<template>
  <div id="lx-root" class="flex h-screen w-full overflow-hidden" :class="{'flex-col': ui.isMobile}" style="background:var(--bg);color:var(--text);font-family:var(--font);">
    <!-- 启动中 -->
    <div v-if="booting" class="flex h-full w-full items-center justify-center text-[var(--text3)]">加载中…</div>

    <!-- 登录屏 -->
    <div v-else-if="!auth.authed" class="flex h-full w-full items-center justify-center p-6" style="background:radial-gradient(120% 90% at 50% 0%, var(--surface-base) 0%, var(--bg) 60%);">
      <div v-fade class="flex w-[400px] max-w-full flex-col gap-[22px]">
        <div class="flex flex-col items-center gap-[14px]">
          <div class="flex h-[52px] w-[52px] items-center justify-center rounded-[15px] bg-[var(--accent)] text-[26px] font-semibold text-[var(--accent-contrast)]" style="font-family:var(--display);box-shadow:var(--shadow-md);">灵</div>
          <div class="text-center"><div class="text-[24px] font-semibold text-[var(--text)]" style="font-family:var(--display);">登录 LinX 灵信</div><div class="mt-[5px] text-[13.5px] font-medium text-[var(--text3)]">AI 原生 todo · 内部测试版</div></div>
        </div>
        <Card class="gap-[14px] rounded-[18px] border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow)]">
          <label v-if="authMode === 'register'" class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">显示名称</span><Input v-model="authName" placeholder="你的名字" class="h-11 rounded-[10px] border-[var(--line2)] bg-[var(--bg)] px-[13px] text-sm font-medium" /></label>
          <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">邮箱</span><Input v-model="authEmail" @keydown.enter="submitAuth" type="email" placeholder="you@team.com" class="h-11 rounded-[10px] border-[var(--line2)] bg-[var(--bg)] px-[13px] text-sm font-medium" /></label>
          <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">密码</span><Input v-model="authPassword" @keydown.enter="submitAuth" type="password" :placeholder="authMode==='register'?'至少 8 位':'输入密码'" class="h-11 rounded-[10px] border-[var(--line2)] bg-[var(--bg)] px-[13px] text-sm font-medium" /></label>
          <div v-if="authError" class="rounded-[9px] bg-[var(--danger-bg)] px-3 py-[9px] text-[12.5px] font-medium text-[var(--danger)]">{{ authError }}</div>
          <Button @click="submitAuth" :disabled="authBusy" class="mt-1 h-11 gap-[7px] rounded-[11px] text-[14.5px] font-semibold shadow-[var(--shadow)]">{{ authBusy ? '请稍候…' : (authMode === 'register' ? '注册并进入' : '登录') }} <i class="ph ph-arrow-right"></i></Button>
          <div class="text-center text-[12.5px] font-medium text-[var(--text3)]">{{ authMode === 'register' ? '已有账号？' : '还没有账号？' }}<span @click="authMode = authMode === 'register' ? 'login' : 'register'" class="ml-[5px] cursor-pointer font-semibold text-[var(--accent-ink)]">{{ authMode === 'register' ? '去登录' : '注册新账号' }}</span></div>
        </Card>
        <div class="text-center text-xs font-medium leading-relaxed text-[var(--text3)]">你的数据仅自己可见 · 首个注册账号为管理员</div>
      </div>
    </div>

    <!-- 壳：rail + 视图区 -->
    <template v-else>
      <nav v-if="!ui.isMobile" class="flex flex-none flex-col items-center gap-[6px] bg-[var(--rail)] px-[9px] py-3" style="width:64px;">
        <div class="mb-2 flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-[var(--accent)] text-[19px] font-semibold text-[var(--accent-contrast)]" style="font-family:var(--display);box-shadow:var(--shadow);">灵</div>
        <IconButton icon="ph-magnifying-glass" label="搜索 (⌘K)" variant="subtle" size="md" class="mb-2" @click="ui.openSearch()" />
        <TooltipProvider :delay-duration="400">
          <Tooltip v-for="n in NAV" :key="n[0]">
            <TooltipTrigger class="w-full">
              <button
                @click="go(n[0])"
                :aria-label="n[1]"
                :class="cn(
                  'flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-[12px] text-[22px] transition-colors duration-[160ms] border-0',
                  view === n[0]
                    ? 'bg-[var(--accent-bg)] text-[var(--accent-ink)]'
                    : 'text-[var(--text2)] hover:bg-[var(--mid)] hover:text-[var(--text)] bg-transparent',
                )"
              ><i :class="['ph', n[2]]"></i></button>
            </TooltipTrigger>
            <TooltipContent side="right">{{ n[1] }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div class="flex-1"></div>
        <a v-if="auth.canAdmin" :href="adminUrl" title="监控后台" class="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] text-[22px] text-[var(--text2)] no-underline transition-colors duration-[160ms] hover:bg-[var(--mid)] hover:text-[var(--text)]"><i class="ph ph-chart-line-up"></i></a>
        <IconButton icon="ph-bell" label="通知" variant="ghost" size="sm" class="relative mt-1" @click="ui.toggleNotif()"><span v-if="hasUnread" class="absolute right-[5px] top-[5px] flex h-[15px] min-w-[15px] items-center justify-center rounded-[8px] bg-[var(--danger)] px-[3px] text-[9px] font-bold text-[var(--accent-contrast)]"><span class="lx-mono">{{ unread }}</span></span></IconButton>
        <IconButton :icon="ui.theme==='dark'?'ph-sun':'ph-moon'" :label="ui.theme==='dark'?'切换明亮':'切换深色'" variant="ghost" size="sm" class="mt-1" @click="ui.toggleTheme()" />
        <div :title="auth.user.name" class="mt-1.5 flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full bg-[var(--surface-active)] text-[13px] font-semibold text-[var(--text-secondary)] transition-colors duration-[160ms] hover:bg-[var(--mid)]" @click="go('settings')">{{ meBig }}</div>
        <IconButton icon="ph-sign-out" label="退出登录" variant="ghost" size="sm" class="mt-1" @click="logout" />
      </nav>

      <!-- 移动端顶栏 -->
      <div v-if="ui.isMobile" class="flex flex-none items-center gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-2">
        <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-semibold text-[var(--accent-contrast)]">灵</div>
        <span class="text-sm font-bold text-[var(--text)]">LinX 灵信</span>
        <div class="flex-1"></div>
        <IconButton icon="ph-magnifying-glass" label="搜索" variant="ghost" size="sm" @click="ui.openSearch()" />
        <IconButton icon="ph-bell" label="通知" variant="ghost" size="sm" class="relative" @click="ui.toggleNotif()"><span v-if="hasUnread" class="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--danger)]"></span></IconButton>
        <IconButton :icon="ui.theme==='dark'?'ph-sun':'ph-moon'" label="主题" variant="ghost" size="sm" @click="ui.toggleTheme()" />
        <IconButton icon="ph-sign-out" label="登出" variant="ghost" size="sm" @click="logout" />
      </div>
      <div class="relative min-w-0 flex-1">
        <ChatView v-if="view==='chat'" :workspace="ui.workspace" :privacy="ui.privacy" :openTask="openTask" :openIdea="openIdea" :openNon="openNon" :afterSend="afterSend" :setWorkspace="ui.setWorkspace" :togglePrivacy="ui.togglePrivacy" :isMobile="ui.isMobile" />
        <DatabaseView v-else-if="view==='database'" :workspace="ui.workspace" :privacy="ui.privacy" :openTask="openTask" :isMobile="ui.isMobile" />
        <ProjectsView v-else-if="view==='projects'" :workspace="ui.workspace" :privacy="ui.privacy" :openTask="openTask" :isMobile="ui.isMobile" />
        <FriendsView v-else-if="view==='friends'" :isMobile="ui.isMobile" />
        <ClarifyView v-else-if="view==='clarify'" :workspace="ui.workspace" :privacy="ui.privacy" :isMobile="ui.isMobile" />
        <NonTodoView v-else-if="view==='nontodo'" :workspace="ui.workspace" :privacy="ui.privacy" :isMobile="ui.isMobile" />
        <AgentView v-else-if="view==='agent'" :isMobile="ui.isMobile" />
        <SettingsView v-else-if="view==='settings'" :isMobile="ui.isMobile" />
        <div v-else class="flex flex-1 items-center justify-center text-[var(--text3)]">未知视图</div>

        <!-- 任务详情浮层 -->
        <TaskDetailView v-if="ui.detailId" :taskId="ui.detailId" :afterChange="afterSend" @close="ui.closeDetail()" />
      </div>

      <!-- 移动端底栏 -->
      <nav v-if="ui.isMobile" class="flex flex-none items-center justify-around border-t border-[var(--line)] bg-[var(--panel)] py-1">
        <a v-for="n in NAV" :key="n[0]" @click="go(n[0])" :title="n[1]" :class="cn('flex flex-col items-center gap-0.5 px-1 py-1 cursor-pointer', view === n[0] ? 'text-[var(--accent-ink)]' : 'text-[var(--text3)]')"><i :class="['ph', n[2]]" class="text-[18px]"></i><span class="text-[9px] font-medium">{{ n[1].slice(0,2) }}</span></a>
      </nav>

      <!-- 通知面板 -->
      <template v-if="ui.notifOpen">
        <div @click="ui.closeNotif()" class="fixed inset-0 z-40"></div>
        <div class="fixed bottom-4 z-[41] w-[340px] max-w-[80vw] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--elev)]" style="left:74px;box-shadow:var(--shadow-md);animation:lx-pop .18s ease;">
          <div class="flex items-center gap-2 border-b border-[var(--line)] px-4 py-[14px]"><i class="ph ph-bell text-[var(--accent-ink)]"></i><span class="text-sm font-semibold text-[var(--text)]" style="font-family:var(--display);">通知</span><div class="flex-1"></div><button @click="ui.markAllRead()" class="text-[11.5px] font-semibold text-[var(--accent-ink)]" style="border:0;background:transparent;cursor:pointer;">全部已读</button></div>
          <div class="max-h-[360px] overflow-auto">
            <div v-for="(n, i) in notifList" :key="i" class="flex gap-[11px] border-b border-[var(--line)] px-4 py-3"><i :class="`ph ${n.icon}`" :style="`color:${n.color};font-size:18px;margin-top:1px;flex:0 0 auto;`"></i><div class="min-w-0 flex-1"><div class="text-[12.5px] font-medium leading-relaxed text-[var(--text)]">{{ n.text }}</div><div class="mt-[3px] text-[11px] font-medium text-[var(--text3)]"><span class="lx-mono">{{ n.time }}</span></div><template v-if="n.isInvite && !n.wasInvite"><div class="mt-2 flex flex-wrap gap-[7px]"><button @click="acceptInvite(n.actionRef)" class="rounded-lg bg-[var(--accent)] px-[12px] py-[6px] text-xs font-semibold text-[var(--accent-contrast)]" style="border:0;cursor:pointer;">接受并提醒我</button><button @click="followInvite(n.actionRef)" title="不进我的任务库，只接收进展通知" class="rounded-lg border border-[var(--line2)] bg-[var(--panel)] px-[11px] py-[6px] text-xs font-semibold text-[var(--text2)]" style="cursor:pointer;">仅关注</button><button @click="declineInvite(n.actionRef)" class="rounded-lg border border-[var(--line2)] bg-[var(--panel)] px-[11px] py-[6px] text-xs font-semibold text-[var(--text2)]" style="cursor:pointer;">拒绝</button></div></template><template v-if="n.wasInvite"><div class="mt-1.5 flex items-center gap-1 text-xs font-semibold text-[var(--text3)]"><i class="ph ph-check"></i>已处理</div></template><template v-if="n.isFriendReq && !n.wasFriendReq"><div class="mt-2 flex flex-wrap gap-[7px]"><button @click="acceptFriend(n.actionRef)" class="rounded-lg bg-[var(--accent)] px-[12px] py-[6px] text-xs font-semibold text-[var(--accent-contrast)]" style="border:0;cursor:pointer;">接受好友</button><button @click="declineFriend(n.actionRef)" class="rounded-lg border border-[var(--line2)] bg-[var(--panel)] px-[11px] py-[6px] text-xs font-semibold text-[var(--text2)]" style="cursor:pointer;">拒绝</button></div></template><template v-if="n.wasFriendReq"><div class="mt-1.5 flex items-center gap-1 text-xs font-semibold text-[var(--text3)]"><i class="ph ph-check"></i>已处理</div></template></div><span :style="`width:8px;height:8px;border-radius:50%;background:${n.dot};margin-top:5px;flex:0 0 auto;`"></span></div>
            <div v-if="notifList.length === 0" class="flex flex-col items-center gap-2 px-4 py-[30px] text-center text-[var(--text3)]"><i class="ph ph-bell-slash text-[22px]"></i><div class="text-xs font-medium">暂无通知</div></div>
          </div>
        </div>
      </template>

      <!-- 搜索面板 ⌘K -->
      <template v-if="ui.searchOpen">
        <div @click="ui.closeSearch()" @keydown.esc.prevent.stop="ui.closeSearch()" class="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" style="background:var(--overlay-scrim);">
          <div @click.stop class="w-[560px] max-w-[90vw] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--elev)]" style="box-shadow:var(--shadow-md);animation:lx-pop .18s ease;">
            <div class="flex items-center gap-[11px] border-b border-[var(--line)] px-[18px] py-[15px]"><i class="ph ph-magnifying-glass text-[19px] text-[var(--text3)]"></i><input ref="searchInput" :value="ui.searchQuery" @input="ui.searchQuery = ($event.target as HTMLInputElement).value; ui.paletteIndex = 0" @keydown="paletteKey" placeholder="搜索任务、待澄清、非 todo、项目…" class="flex-1 border-0 bg-transparent text-[15px] font-medium text-[var(--text)]" /><span class="rounded-md border border-[var(--line2)] px-[6px] py-[3px] text-[10.5px] font-semibold text-[var(--text3)]">Esc</span></div>
            <div class="max-h-[52vh] overflow-auto p-[6px_0]">
              <template v-for="(g, gi) in paletteGroups" :key="gi">
                <div class="px-[18px] pb-[5px] pt-[9px] text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--text3)]">{{ g.name }}</div>
                <template v-for="(it, ii) in g.items" :key="ii"><a @click="it.run" class="flex cursor-pointer items-center gap-[11px] px-[18px] py-[10px]" :style="`background:${flatIndex(gi,ii)===ui.paletteIndex?'var(--mid)':'transparent'};`" data-hv="0"><i :class="`ph ${it.icon}`" class="text-[17px] text-[var(--accent-ink)]"></i><span class="flex-1 truncate text-[13.5px] font-semibold text-[var(--text)]">{{ it.label }}</span></a></template>
              </template>
              <div v-if="paletteGroups.length === 0" class="px-[18px] py-6 text-center text-[13px] font-medium text-[var(--text3)]">没有匹配的结果</div>
            </div>
            <div class="flex gap-[14px] border-t border-[var(--line)] px-[18px] py-[10px] text-[11px] font-medium text-[var(--text3)]"><span>↑↓ 选择</span><span>↵ 执行</span><span>esc 关闭</span></div>
          </div>
        </div>
      </template>

      <!-- 快捷键 modal -->
      <template v-if="ui.shortcutsOpen">
        <div @click="ui.closeShortcuts()" @keydown.esc.prevent.stop="ui.closeShortcuts()" class="fixed inset-0 z-50 flex items-center justify-center p-6" style="background:var(--overlay-scrim);">
          <div @click.stop class="w-[430px] max-w-[92vw] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--elev)]" style="box-shadow:var(--shadow-md);animation:lx-pop .18s ease;">
            <div class="flex items-center gap-2.5 border-b border-[var(--line)] px-[18px] py-[15px]"><i class="ph ph-keyboard text-[19px] text-[var(--accent-ink)]"></i><span class="text-[15px] font-semibold text-[var(--text)]" style="font-family:var(--display);">键盘快捷键</span></div>
            <div class="px-[18px] py-[14px]">
              <div class="flex items-center gap-3 border-b border-[var(--line)] py-[11px]"><span class="flex-1 text-[13px] font-medium text-[var(--text)]">命令面板</span><span class="rounded-md border border-[var(--line2)] px-2 py-1 text-[11.5px] font-semibold text-[var(--text2)]">⌘K&nbsp;/&nbsp;/</span></div>
              <div class="flex items-center gap-3 border-b border-[var(--line)] py-[11px]"><span class="flex-1 text-[13px] font-medium text-[var(--text)]">新建捕获</span><span class="rounded-md border border-[var(--line2)] px-2 py-1 text-[11.5px] font-semibold text-[var(--text2)]">N</span></div>
              <div class="flex items-center gap-3 border-b border-[var(--line)] py-[11px]"><span class="flex-1 text-[13px] font-medium text-[var(--text)]">跳转 · 聊天/数据库/项目/设置</span><span class="rounded-md border border-[var(--line2)] px-2 py-1 text-[11.5px] font-semibold text-[var(--text2)]">G 然后 C/D/P/S</span></div>
              <div class="flex items-center gap-3 py-[11px]"><span class="flex-1 text-[13px] font-medium text-[var(--text)]">显示 / 关闭本表</span><span class="rounded-md border border-[var(--line2)] px-2 py-1 text-[11.5px] font-semibold text-[var(--text2)]">?</span></div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- toast（全局，读 useToast store） -->
    <div v-if="toast.msg" style="position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;background:var(--text);color:var(--bg);padding:11px 18px;border-radius:12px;font:600 13px/1 var(--font);box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:8px;animation:lx-pop .25s ease;"><i class="ph ph-check-circle"></i>{{ toast.msg }}</div>
  </div>
</template>
