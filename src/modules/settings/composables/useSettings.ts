// 设置域 composable：账号 / 通用 / AI 接入 / 通知 / 隐私 / 数据 全部状态与操作下沉。
// 视图只负责模板与分段样式（seg）。toast 经 useToast——与视图共用同一 store 实例
// （Pinia 单例），故视图保留自己的 useToast() 供模板内联 toast.flash，模板无需改动。
import { ref, reactive, computed, onMounted } from 'vue'
import { AuthAPI } from '@/modules/auth/api'
import { AppAPI } from '@/modules/app/api'
import { SettingsAPI } from '@/modules/settings/api'
import { setToken } from '@/infrastructure/request'
import { applyTheme, type Theme } from '@/shared/utils/theme'
import { AI_PRESETS, type AiPreset } from '@/modules/agent/constants'
import type { AiConfig } from '@/types/api'
import { useToast } from '@/stores/toast'
import { useEventsStore } from '@/stores/events'

export type Section = 'account' | 'general' | 'ai' | 'notifications' | 'privacy' | 'data'

export function useSettings() {
  const toast = useToast()
  const events = useEventsStore()

  const section = ref<Section>('account')
  const SET_SECTIONS: Array<[Section, string]> = [['account', '账号'], ['general', '通用'], ['ai', 'AI 接入'], ['notifications', '通知'], ['privacy', '隐私与安全'], ['data', '数据']]

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
      const [me, st, ai] = await Promise.all([AuthAPI.me(), AppAPI.getState(), SettingsAPI.getAiConfig().catch(() => null)])
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
    if (col) SettingsAPI.updateSettings({ [col]: field === 'privacyDefault' ? !!val : val } as any).catch(() => {})
  }
  function toggleNotifPref(k: 'assign' | 'due' | 'fail' | 'done') {
    s.notifPrefs[k] = !s.notifPrefs[k]
    SettingsAPI.updateSettings({ notifPrefs: { ...s.notifPrefs } }).catch(() => {})
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
    SettingsAPI.testAiConfig(aiCfg()).then((r: any) => { s.aiTested = !!r.ok; toast.flash(r.ok ? ('连接正常 · ' + (r.kind || '模型可用')) : ('连接失败：' + (r.error || ''))) })
      .catch((e: any) => { s.aiTested = false; toast.flash('测试失败：' + e.message) })
  }
  function saveSettings() {
    SettingsAPI.updateAiConfig(aiCfg()).then(() => { apiKey.value = ''; toast.flash('AI 接入配置已保存') }).catch((e: any) => toast.flash('保存失败：' + e.message))
  }
  function saveOwnAi() {
    SettingsAPI.updateOwnAiConfig(aiCfg()).then(() => { aiSource.value = 'own'; apiKey.value = ''; toast.flash('已保存个人 AI 配置（仅对你生效）') }).catch((e: any) => toast.flash('保存失败：' + e.message))
  }
  function clearOwnAi() {
    SettingsAPI.clearOwnAiConfig().then(() => { load(); toast.flash('已恢复使用团队配置') }).catch((e: any) => toast.flash('操作失败：' + e.message))
  }
  function submitPwd() {
    if (!pwdNew.value || pwdNew.value.length < 8) { toast.flash('新密码至少 8 位'); return }
    pwdBusy.value = true
    AuthAPI.changePassword(pwdOld.value, pwdNew.value).then(() => { pwdBusy.value = false; pwdOpen.value = false; pwdOld.value = ''; pwdNew.value = ''; toast.flash('密码已更新') })
      .catch((e: any) => { pwdBusy.value = false; toast.flash('修改失败：' + e.message) })
  }
  function doExport() {
    SettingsAPI.exportData().then((data: any) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'linx-export-' + new Date().toISOString().slice(0, 10) + '.json'
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      toast.flash('已导出全部数据 (JSON)')
    }).catch((e: any) => toast.flash('导出失败：' + e.message))
  }
  function doClearData() {
    if (!window.confirm('确定清空当前账号下的全部任务、想法与聊天记录吗？此操作不可恢复。')) return
    SettingsAPI.clearData().then(() => { load(); toast.flash('已清空数据') }).catch((e: any) => toast.flash('清空失败：' + e.message))
  }
  function onName(e: Event) {
    const v = (e.target as HTMLInputElement).value.trim()
    if (!v) { toast.flash('称呼不能为空'); return }
    const old = user.name; user.name = v
    AuthAPI.updateMe({ name: v }).then((u: any) => { user.name = u.name || v; user.accountName = u.accountName || user.accountName })
      .catch((err: any) => { user.name = old; toast.flash('保存失败：' + err.message) })
  }
  function onAccountName(e: Event) {
    const v = (e.target as HTMLInputElement).value.trim()
    const old = user.accountName
    if (!v) { toast.flash('账户名不能为空'); return }
    user.accountName = v
    AuthAPI.updateMe({ accountName: v }).then((u: any) => { user.accountName = u.accountName || v; toast.flash('账户名已更新') })
      .catch((err: any) => { user.accountName = old; toast.flash('保存失败：' + err.message) })
  }
  function toggleTheme() {
    s.theme = s.theme === 'dark' ? 'light' : 'dark'
    applyTheme(s.theme)
    SettingsAPI.updateSettings({ theme: s.theme }).catch(() => {})
  }
  function logout() {
    AuthAPI.logout().catch(() => {})
    setToken('')
    events.disconnect()
    location.reload()
  }

  return {
    section, SET_SECTIONS, loading, user, s, apiKey, ownAiOpen, pwdOpen, pwdOld, pwdNew, pwdBusy,
    canAdmin, roleLabel, meBig, sAccountName, aiIsRule, aiPresetHint, aiOwnActive, setName,
    viewOptions, aiPresetOptions,
    updateSetting, toggleNotifPref, pickAiPreset, setAiField, testConn, saveSettings, saveOwnAi,
    clearOwnAi, submitPwd, doExport, doClearData, onName, onAccountName, toggleTheme, logout,
  }
}
