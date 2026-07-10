// P4c-step1：UI store（壳状态地基）。AppShell 将使用。
// 旧 App 的 theme/workspace/privacy/view/isMobile/detailId + toggleTheme/setWorkspace/togglePrivacy/go/openTask 迁此。
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import { applyTheme } from '@/lib/theme'

export type Theme = 'light' | 'dark'
export type Workspace = 'work' | 'personal'

export const useUiStore = defineStore('ui', () => {
  const theme = ref<Theme>('light')
  const workspace = ref<Workspace>('work')
  const privacy = ref(false)
  const view = ref('chat')
  const isMobile = ref(false)
  const detailId = ref<string | null>(null)
  const notifOpen = ref(false)
  const notifs = ref<any[]>([])

  async function loadNotifs() { try { notifs.value = await api.notifications() } catch { /* ignore */ } }
  async function markAllRead() { try { await api.markAllNotificationsRead(); await loadNotifs() } catch { /* ignore */ } }
  function toggleNotif() { notifOpen.value = !notifOpen.value; if (notifOpen.value) loadNotifs() }
  function closeNotif() { notifOpen.value = false }

  // 从 appSettings 载入 theme/workspace/privacy（登录后调）
  async function load() {
    try {
      const st = await api.getState()
      const as = ((st as any).appSettings || {}) as Record<string, any>
      if (as.theme === 'dark' || as.theme === 'light') theme.value = as.theme
      if (as.workspaceMode === 'work' || as.workspaceMode === 'personal') workspace.value = as.workspaceMode
      privacy.value = as.privacyMode != null ? !!as.privacyMode : false
      applyTheme(theme.value)
    } catch { /* ignore */ }
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    applyTheme(theme.value)
    api.updateSettings({ theme: theme.value }).catch(() => {})
  }
  function setWorkspace(ws: Workspace) { workspace.value = ws; api.updateSettings({ workspaceMode: ws } as any).catch(() => {}) }
  function togglePrivacy() { privacy.value = !privacy.value; api.updateSettings({ privacyMode: privacy.value } as any).catch(() => {}) }
  function go(v: string) { view.value = v }
  function openTask(id: string) { detailId.value = id }
  function closeDetail() { detailId.value = null }
  function setMobile(m: boolean) { isMobile.value = m }

  return { theme, workspace, privacy, view, isMobile, detailId, notifOpen, notifs, load, toggleTheme, setWorkspace, togglePrivacy, go, openTask, closeDetail, setMobile, loadNotifs, markAllRead, toggleNotif, closeNotif }
})
