<script setup lang="ts">
// P3 第一个迁移视图：设置。自包含--挂载时自取 me/getState/getAiConfig，本地 reactive 持有，
// 所有变更走 API + 本地状态（逐方法对齐旧 App.vue）。section 由旧 App 中栏导航经 prop 传入
// （布局零改动：中栏 section 导航保留，本组件只替换主内容区）。toast 经 useToast、主题经 lib/theme。
import { ref, reactive, computed, onMounted } from 'vue'
import { api, setToken } from '@/lib/api'
import { applyTheme, type Theme } from '@/lib/theme'
import { AI_PRESETS, type AiPreset } from '@/lib/aiPresets'
import type { AiConfig } from '@/types/api'
import { useToast } from '@/stores/toast'
import { useEventsStore } from '@/stores/events'
import Button from '@/components/ui/button/Button.vue'
import ViewHeader from '@/components/base/ViewHeader.vue'
import LoadingState from '@/components/base/LoadingState.vue'
import PageBody from '@/components/base/PageBody.vue'
import ContentCard from '@/components/base/ContentCard.vue'
import Input from '@/components/ui/input/Input.vue'
import Switch from '@/components/ui/switch/Switch.vue'

type Section = 'account' | 'general' | 'ai' | 'notifications' | 'privacy' | 'data'
defineProps<{ isMobile?: boolean }>()
const section = ref<Section>('account')
const SET_SECTIONS: Array<[Section, string]> = [['account', '账号'], ['general', '通用'], ['ai', 'AI 接入'], ['notifications', '通知'], ['privacy', '隐私与安全'], ['data', '数据']]

const toast = useToast()
const events = useEventsStore()

const loading = ref(true)
const user = reactive({ name: '', accountName: '', email: '', role: 'member' as string })
const s = reactive({
  theme: 'light' as Theme,
  defaultWs: 'work' as 'work' | 'personal',
  defaultView: 'chat',
  aiVisibility: 'visible_scope_only',
  privacyDefault: false,
  friendPolicy: 'open' as 'open' | 'closed',
  notifPrefs: { assign: true, due: true, fail: true, done: true },
  aiPreset: '规则版（离线）',
  aiProvider: 'rule',
  aiBaseUrl: '',
  aiModel: '',
  aiHasKey: false,
  aiFallback: true,
  aiTested: false,
})
const aiSource = ref<'team' | 'own'>('team')
const apiKey = ref('')
const ownAiOpen = ref(false)
const pwdOpen = ref(false)
const pwdOld = ref('')
const pwdNew = ref('')
const pwdBusy = ref(false)

const canAdmin = computed(() => user.role === 'admin')
const roleLabel = computed(() => (({ admin: '管理员', member: '成员', viewer: '只读' }) as Record<string, string>)[user.role] || '成员')
const meBig = computed(() => (user.name || '我').slice(-1))
const sAccountName = computed(() => user.accountName || user.name)
const aiIsRule = computed(() => s.aiProvider === 'rule')
const aiPresetHint = computed(() => (AI_PRESETS.find((p) => p.name === s.aiPreset) || {}).hint || '')
const aiOwnActive = computed(() => aiSource.value === 'own')
const setName = computed(() => (({ account: '账号', general: '通用', ai: 'AI 接入', notifications: '通知', privacy: '隐私与安全', data: '数据' }) as Record<Section, string>)[section.value])
const viewOptions = [{ value: 'chat', label: '聊天' }, { value: 'database', label: 'Todo 数据库' }, { value: 'projects', label: '项目' }]
const aiPresetOptions = AI_PRESETS.map((p) => ({ value: p.name, label: p.name }))

function presetNameFor(ai: { provider?: string; baseUrl?: string } | null): string {
  if (!ai) return '规则版（离线）'
  return (AI_PRESETS.find((p) => p.provider === ai.provider && (p.baseUrl || '') === (ai.baseUrl || '')) || {}).name
    || (ai.provider === 'rule' ? '规则版（离线）' : '自定义')
}

async function load() {
  loading.value = true
  try {
    const [me, st, ai] = await Promise.all([api.me(), api.getState(), api.getAiConfig().catch(() => null)])
    user.name = me.name || ''
    user.accountName = me.accountName || me.name || ''
    user.email = me.email || ''
    user.role = me.role || 'member'
    const as = ((st as any).appSettings || {}) as Record<string, any>
    s.theme = as.theme === 'dark' ? 'dark' : 'light'
    s.defaultWs = as.workspaceMode || 'work'
    s.defaultView = as.defaultView || 'chat'
    s.aiVisibility = as.aiVisibility || 'visible_scope_only'
    s.privacyDefault = as.privacyMode != null ? !!as.privacyMode : false
    s.friendPolicy = as.friendPolicy === 'closed' ? 'closed' : 'open'
    const np = as.notifPrefs && typeof as.notifPrefs === 'object' ? as.notifPrefs : {}
    s.notifPrefs = { assign: np.assign !== false, due: np.due !== false, fail: np.fail !== false, done: np.done !== false }
    if (ai) {
      s.aiProvider = ai.provider || 'rule'
      s.aiBaseUrl = ai.baseUrl || ''
      s.aiModel = ai.model || ''
      s.aiHasKey = !!ai.hasKey
      s.aiFallback = ai.fallbackToRule !== false
      s.aiTested = !!ai.hasKey
      aiSource.value = ai.source === 'own' ? 'own' : 'team'
      s.aiPreset = presetNameFor(ai)
      ownAiOpen.value = aiSource.value === 'own'
    } else {
      s.aiPreset = '规则版（离线）'; s.aiProvider = 'rule'
    }
    apiKey.value = ''
  } catch {
    toast.flash('加载设置失败，请刷新重试')
  } finally {
    loading.value = false
  }
}
onMounted(load)

// ---- 变更方法（对齐旧 App.vue）----
const FIELD_MAP: Record<string, string> = { defaultWs: 'workspaceMode', defaultView: 'defaultView', aiVisibility: 'aiVisibility', privacyDefault: 'privacyMode', friendPolicy: 'friendPolicy' }
function updateSetting(field: string, val: unknown) {
  ;(s as any)[field] = val
  const col = FIELD_MAP[field]
  if (col) api.updateSettings({ [col]: field === 'privacyDefault' ? !!val : val } as any).catch(() => {})
}
function toggleNotifPref(k: 'assign' | 'due' | 'fail' | 'done') {
  s.notifPrefs[k] = !s.notifPrefs[k]
  api.updateSettings({ notifPrefs: { ...s.notifPrefs } }).catch(() => {})
}
function pickAiPreset(p: AiPreset) {
  s.aiPreset = p.name; s.aiProvider = p.provider; s.aiBaseUrl = p.baseUrl
  s.aiModel = (p.models && p.models[0]) || ''; s.aiTested = false
}
function setAiField(field: string, val: unknown) {
  ;(s as any)[field] = val; s.aiTested = false
  if ((field === 'aiBaseUrl' || field === 'aiModel') && s.aiPreset !== '规则版（离线）') s.aiPreset = '自定义'
}
function aiCfg(): AiConfig {
  const cfg: AiConfig = { provider: s.aiProvider || 'rule', baseUrl: (s.aiBaseUrl || '').trim(), model: (s.aiModel || '').trim(), fallbackToRule: s.aiFallback !== false }
  if ((apiKey.value || '').trim()) cfg.apiKey = apiKey.value.trim()
  return cfg
}
function testConn() {
  toast.flash('测试中…')
  api.testAiConfig(aiCfg()).then((r: any) => { s.aiTested = !!r.ok; toast.flash(r.ok ? ('连接正常 · ' + (r.kind || '模型可用')) : ('连接失败：' + (r.error || ''))) })
    .catch((e: any) => { s.aiTested = false; toast.flash('测试失败：' + e.message) })
}
function saveSettings() {
  api.updateAiConfig(aiCfg()).then(() => { apiKey.value = ''; toast.flash('AI 接入配置已保存') }).catch((e: any) => toast.flash('保存失败：' + e.message))
}
function saveOwnAi() {
  api.updateOwnAiConfig(aiCfg()).then(() => { aiSource.value = 'own'; apiKey.value = ''; toast.flash('已保存个人 AI 配置（仅对你生效）') }).catch((e: any) => toast.flash('保存失败：' + e.message))
}
function clearOwnAi() {
  api.clearOwnAiConfig().then(() => { load(); toast.flash('已恢复使用团队配置') }).catch((e: any) => toast.flash('操作失败：' + e.message))
}
function submitPwd() {
  if (!pwdNew.value || pwdNew.value.length < 8) { toast.flash('新密码至少 8 位'); return }
  pwdBusy.value = true
  api.changePassword(pwdOld.value, pwdNew.value).then(() => { pwdBusy.value = false; pwdOpen.value = false; pwdOld.value = ''; pwdNew.value = ''; toast.flash('密码已更新') })
    .catch((e: any) => { pwdBusy.value = false; toast.flash('修改失败：' + e.message) })
}
function doExport() {
  api.exportData().then((data: any) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'linx-export-' + new Date().toISOString().slice(0, 10) + '.json'
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    toast.flash('已导出全部数据 (JSON)')
  }).catch((e: any) => toast.flash('导出失败：' + e.message))
}
function doClearData() {
  if (!window.confirm('确定清空当前账号下的全部任务、想法与聊天记录吗？此操作不可恢复。')) return
  api.clearData().then(() => { load(); toast.flash('已清空数据') }).catch((e: any) => toast.flash('清空失败：' + e.message))
}
function onName(e: Event) {
  const v = (e.target as HTMLInputElement).value.trim()
  if (!v) { toast.flash('称呼不能为空'); return }
  const old = user.name; user.name = v
  api.updateMe({ name: v }).then((u: any) => { user.name = u.name || v; user.accountName = u.accountName || user.accountName })
    .catch((err: any) => { user.name = old; toast.flash('保存失败：' + err.message) })
}
function onAccountName(e: Event) {
  const v = (e.target as HTMLInputElement).value.trim()
  const old = user.accountName
  if (!v) { toast.flash('账户名不能为空'); return }
  user.accountName = v
  api.updateMe({ accountName: v }).then((u: any) => { user.accountName = u.accountName || v; toast.flash('账户名已更新') })
    .catch((err: any) => { user.accountName = old; toast.flash('保存失败：' + err.message) })
}
function toggleTheme() {
  s.theme = s.theme === 'dark' ? 'light' : 'dark'
  applyTheme(s.theme)
  api.updateSettings({ theme: s.theme }).catch(() => {})
}
function logout() {
  api.logout().catch(() => {})
  setToken('')
  events.disconnect()
  location.reload()
}

// 分段控件按钮样式（工作/个人、明亮/深色 等）
const seg = (on: boolean) => on
  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
  : 'text-[var(--text2)]'
</script>

<template>
  <div class="flex h-full flex-col">
    <ViewHeader icon="ph-gear" title="设置">{{ setName }}</ViewHeader>

    <PageBody :is-mobile="isMobile">
      <LoadingState v-if="loading" class="h-full" />
      <div v-else class="mx-auto flex max-w-[600px] flex-col gap-4">
        <!-- section 标签栏（in-content，替代旧中栏导航） -->
        <div class="flex flex-wrap gap-1 rounded-[10px] bg-[var(--mid)] p-[3px]">
          <button v-for="s in SET_SECTIONS" :key="s[0]" @click="section = s[0]" :style="`border:0;padding:7px 13px;border-radius:7px;cursor:pointer;font:${section===s[0]?'600':'500'} 12.5px/1 var(--font);${section===s[0]?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);'}`">{{ s[1] }}</button>
        </div>

        <!-- 账号 -->
        <template v-if="section === 'account'">
          <div class="flex items-center gap-[14px] rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-[18px] shadow-md">
            <span class="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-2xl bg-[var(--accent)] text-2xl font-semibold text-[var(--accent-contrast)]" style="font-family: var(--display)">{{ meBig }}</span>
            <div class="min-w-0 flex-1">
              <div class="text-base font-semibold text-[var(--text)]" style="font-family: var(--display)">{{ user.name }}</div>
              <div class="mt-1 text-[12.5px] font-medium text-[var(--text3)]">@{{ sAccountName }} · {{ user.email }}</div>
            </div>
            <span class="rounded-full bg-[var(--accent-bg)] px-[11px] py-[5px] text-[11.5px] font-semibold text-[var(--accent-ink)]">{{ roleLabel }}</span>
          </div>

          <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">账户名</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">你的唯一账号标识，用于系统展示（登录仍用邮箱）</div></div>
              <input :value="sAccountName" @change="onAccountName" maxlength="24" placeholder="账户名" class="w-[150px] rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[11px] py-2 text-[13px] font-medium text-[var(--text)]" />
            </div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">称呼</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">聊天、问候与协作里对你的称谓，可随时修改</div></div>
              <input :value="user.name" @change="onName" maxlength="24" placeholder="称呼" class="w-[150px] rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[11px] py-2 text-[13px] font-medium text-[var(--text)]" />
            </div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">邮箱</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">登录账号，不可修改</div></div>
              <span class="text-[13.5px] font-medium text-[var(--text2)]">{{ user.email }}</span>
            </div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">角色</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">首个注册账号为管理员，决定后台访问权限</div></div>
              <span class="rounded-full bg-[var(--accent-bg)] px-3 py-[5px] text-xs font-semibold text-[var(--accent-ink)]">{{ roleLabel }}</span>
            </div>
            <div class="flex flex-col py-[15px]">
              <div class="flex items-center gap-[14px]">
                <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">密码</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">验证当前密码后设置新密码</div></div>
                <Button variant="outline" size="sm" @click="pwdOpen = !pwdOpen">{{ pwdOpen ? '收起' : '修改密码' }}</Button>
              </div>
              <div v-if="pwdOpen" class="mt-[14px] flex flex-col gap-[10px] rounded-[11px] bg-[var(--mid)] p-[14px]">
                <Input v-model="pwdOld" type="password" placeholder="当前密码" />
                <Input v-model="pwdNew" type="password" placeholder="新密码（至少 8 位，改密后其他设备将退出登录）" />
                <Button :disabled="pwdBusy" class="self-start" @click="submitPwd">{{ pwdBusy ? '提交中…' : '确认修改' }}</Button>
              </div>
            </div>
          </div>

          <Button variant="outline" class="self-start border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-[var(--danger-bg)]" @click="logout"><i class="ph ph-sign-out"></i>退出登录</Button>
        </template>

        <!-- 通用 -->
        <template v-if="section === 'general'">
          <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">外观主题</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">明亮 / 深色，保存到账号，下次登录生效</div></div>
              <div class="inline-flex gap-0.5 rounded-lg bg-[var(--mid)] p-[3px]">
                <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.theme === 'light')" @click="s.theme !== 'light' && toggleTheme()">明亮</button>
                <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.theme === 'dark')" @click="s.theme !== 'dark' && toggleTheme()">深色</button>
              </div>
            </div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">默认工作区</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">下次登录时进入的空间</div></div>
              <div class="inline-flex gap-0.5 rounded-lg bg-[var(--mid)] p-[3px]">
                <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.defaultWs === 'work')" @click="updateSetting('defaultWs', 'work')">工作</button>
                <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.defaultWs === 'personal')" @click="updateSetting('defaultWs', 'personal')">个人</button>
              </div>
            </div>
            <div class="flex items-center gap-[14px] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">默认视图</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">下次登录首屏进入的页面</div></div>
              <select :value="s.defaultView" @change="updateSetting('defaultView', ($event.target as HTMLSelectElement).value)" class="cursor-pointer rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[10px] py-2 text-[12.5px] font-semibold text-[var(--text)]">
                <option v-for="o in viewOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
          </div>
          <div class="rounded-xl bg-[var(--mid)] p-3 text-xs font-medium text-[var(--text3)] leading-relaxed">以上设置即时保存到你的账号。</div>
        </template>

        <!-- AI（非管理员：个人配置） -->
        <template v-if="section === 'ai' && !canAdmin">
          <div class="flex items-center gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-[18px] shadow-md">
            <span class="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-[var(--accent-bg)] text-[20px] text-[var(--accent-ink)]"><i :class="`ph ${aiOwnActive ? 'ph-user-gear' : 'ph-lock-simple'}`"></i></span>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-[var(--text)]">{{ aiOwnActive ? '正在使用你的个人 AI 配置' : 'AI 接入由管理员统一配置' }}</div>
              <div class="mt-[3px] text-xs font-medium text-[var(--text3)] leading-snug">当前模型：{{ aiIsRule ? '规则版（离线）' : (s.aiModel || s.aiPreset) }}{{ aiOwnActive ? ' · 仅对你生效' : ' · 全团队共享' }}</div>
            </div>
            <Button variant="outline" size="sm" @click="ownAiOpen = !ownAiOpen">{{ ownAiOpen ? '收起' : '使用自己的 Key' }}</Button>
          </div>
          <ContentCard v-if="ownAiOpen" class="gap-[14px]">
            <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">服务商预设</span>
              <select :value="s.aiPreset" @change="pickAiPreset(AI_PRESETS.find(p => p.name === ($event.target as HTMLSelectElement).value)!)" class="cursor-pointer rounded-[10px] border border-[var(--line2)] bg-[var(--bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--text)]">
                <option v-for="o in aiPresetOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </label>
            <template v-if="!aiIsRule">
              <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">Base URL</span><Input :model-value="s.aiBaseUrl" @update:model-value="(v) => setAiField('aiBaseUrl', v)" placeholder="https://api.deepseek.com/v1" /></label>
              <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">模型</span><Input :model-value="s.aiModel" @update:model-value="(v) => setAiField('aiModel', v)" placeholder="如 deepseek-chat / claude-sonnet-5" /></label>
              <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">API Key</span><Input v-model="apiKey" type="password" :placeholder="aiOwnActive ? '••••••（已配置，留空不修改）' : 'sk-...'" /></label>
            </template>
            <div class="flex items-center gap-2.5">
              <Button size="sm" @click="saveOwnAi">保存个人配置</Button>
              <Button v-if="aiOwnActive" variant="outline" size="sm" @click="clearOwnAi">恢复团队配置</Button>
              <span class="text-[11.5px] font-medium text-[var(--text3)] leading-snug">只影响你自己的 AI 调用 · Key 不回显</span>
            </div>
          </ContentCard>
        </template>

        <!-- AI（管理员：团队配置） -->
        <template v-if="section === 'ai' && canAdmin">
          <ContentCard class="gap-[14px]">
            <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">服务商预设</span>
              <select :value="s.aiPreset" @change="pickAiPreset(AI_PRESETS.find(p => p.name === ($event.target as HTMLSelectElement).value)!)" class="cursor-pointer rounded-[10px] border border-[var(--line2)] bg-[var(--bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--text)]">
                <option v-for="o in aiPresetOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <span v-if="aiPresetHint" class="text-[11.5px] font-medium text-[var(--text3)]">{{ aiPresetHint }}</span>
            </label>
            <template v-if="!aiIsRule">
              <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">Base URL</span><Input :model-value="s.aiBaseUrl" @update:model-value="(v) => setAiField('aiBaseUrl', v)" placeholder="https://api.deepseek.com/v1（Claude 可留空用官方）" /></label>
              <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">模型</span><Input :model-value="s.aiModel" @update:model-value="(v) => setAiField('aiModel', v)" placeholder="如 deepseek-chat / qwen-plus / claude-sonnet-5" /></label>
              <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">API Key <span v-if="s.aiHasKey" class="font-medium text-[var(--text3)]">· 已配置（留空则不修改）</span></span><Input v-model="apiKey" type="password" :placeholder="s.aiHasKey ? '••••••（已配置）' : 'sk-...'" /></label>
              <div class="flex items-center gap-[14px] pt-0.5"><div class="flex-1"><div class="text-[13px] font-semibold text-[var(--text)]">失败兜底</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">模型调用失败时自动回退规则版，不丢输入</div></div><Switch :model-value="s.aiFallback !== false" @update:model-value="(v) => setAiField('aiFallback', v)" /></div>
            </template>
            <div v-else class="rounded-xl bg-[var(--mid)] p-3 text-xs font-medium text-[var(--text3)] leading-relaxed">规则版为离线关键词分类，无需 API Key。切换到其他服务商即可接入真实模型（支持任意 OpenAI 兼容服务）。</div>
          </ContentCard>
          <div class="flex items-center gap-[14px] rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-4 shadow-md">
            <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">连接状态</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">用一条样例验证服务商 / 模型 / Key</div></div>
            <span v-if="s.aiTested" class="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-bg)] px-[11px] py-[5px] text-[11.5px] font-semibold text-[var(--accent-ink)]"><span class="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"></span>可用</span>
            <Button variant="outline" size="sm" @click="testConn">测试连接</Button>
          </div>
          <div class="flex items-center gap-3">
            <Button @click="saveSettings">保存配置</Button>
            <span class="text-xs font-medium text-[var(--text3)]">仅保存在你的账号下 · Key 不回显</span>
          </div>
        </template>

        <!-- 通知 -->
        <template v-if="section === 'notifications'">
          <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">任务指派</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">有人把任务指派给你</div></div><Switch :model-value="s.notifPrefs.assign" @update:model-value="() => toggleNotifPref('assign')" /></div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">到期提醒</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">任务临近截止时间</div></div><Switch :model-value="s.notifPrefs.due" @update:model-value="() => toggleNotifPref('due')" /></div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">AI 失败告警</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">AI 生成失败需要排查</div></div><Switch :model-value="s.notifPrefs.fail" @update:model-value="() => toggleNotifPref('fail')" /></div>
            <div class="flex items-center gap-[14px] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">完成动态</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">团队成员完成任务</div></div><Switch :model-value="s.notifPrefs.done" @update:model-value="() => toggleNotifPref('done')" /></div>
          </div>
          <div class="rounded-xl bg-[var(--mid)] p-3 text-xs font-medium text-[var(--text3)] leading-relaxed">关闭后，对应类型的通知不再出现在左侧通知中心。</div>
        </template>

        <!-- 隐私与安全 -->
        <template v-if="section === 'privacy'">
          <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">AI 可见范围</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">AI 制定计划时可读取的数据</div></div>
              <div class="inline-flex gap-0.5 rounded-lg bg-[var(--mid)] p-[3px]">
                <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.aiVisibility === 'visible_scope_only')" @click="updateSetting('aiVisibility', 'visible_scope_only')">仅可见范围</button>
                <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.aiVisibility === 'all_todo')" @click="updateSetting('aiVisibility', 'all_todo')">全部 todo</button>
              </div>
            </div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">默认开启隐私模式</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">登录后自动隐藏跨空间数据</div></div><Switch :model-value="s.privacyDefault" @update:model-value="(v) => updateSetting('privacyDefault', v)" /></div>
            <div class="flex items-center gap-[14px] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">谢绝陌生人好友请求</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">开启后别人无法向你发起好友请求，只能由你主动添加对方</div></div><Switch :model-value="s.friendPolicy === 'closed'" @update:model-value="() => { updateSetting('friendPolicy', s.friendPolicy === 'closed' ? 'open' : 'closed'); toast.flash(s.friendPolicy === 'closed' ? '已开放接收好友请求' : '已谢绝陌生人好友请求 · 只能由你主动添加') }" /></div>
          </div>
          <div class="rounded-xl bg-[var(--mid)] p-3 text-[12.5px] font-medium text-[var(--text2)] leading-relaxed">隐私模式开启时，AI 只读取当前工作区（工作 / 个人）可见内容，非 todo 内容默认不参与计划。</div>
        </template>

        <!-- 数据 -->
        <template v-if="section === 'data'">
          <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">导出全部数据</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">任务、待澄清、非 todo 与生成记录 (JSON)</div></div><Button variant="outline" size="sm" @click="doExport"><i class="ph ph-download-simple"></i>导出</Button></div>
            <div class="flex items-center gap-[14px] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--danger)]">清空测试数据</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">删除当前账号下的全部测试数据，不可恢复</div></div><Button variant="outline" size="sm" class="border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-[var(--danger-bg)]" @click="doClearData">清空</Button></div>
          </div>
        </template>

      </div>
    </PageBody>
  </div>
</template>
