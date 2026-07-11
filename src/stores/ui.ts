// UI store（壳状态地基）。AppShell 使用。
// 旧 App 的 theme/workspace/privacy/view/isMobile/detailId + toggleTheme/setWorkspace/togglePrivacy/go/openTask 迁此。
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { AppAPI } from '@/modules/app/api'
import { SettingsAPI } from '@/modules/settings/api'
import { NotificationsAPI } from '@/modules/notifications/api'
import { applyTheme } from '@/shared/utils/theme'
import type { Theme } from '@/shared/enums/theme'
import type { Workspace } from '@/shared/enums/workspace'
import type { Notification } from '@/types/api'

export type { Theme, Workspace }

// getState 返回的 appSettings 形状（ui.load 只读这几列）。
interface AppSettingsRow { theme?: string; workspaceMode?: string; privacyMode?: boolean }
interface UiState { appSettings?: AppSettingsRow; [k: string]: unknown }

export const useUiStore = defineStore('ui', () => {
  const theme = ref<Theme>('light')
  const workspace = ref<Workspace>('work')
  const privacy = ref(false)
  const view = ref('chat')
  const isMobile = ref(false)
  const detailId = ref<string | null>(null)
  const notifOpen = ref(false)
  const notifs = ref<Notification[]>([])
  const searchOpen = ref(false)
  const searchQuery = ref('')
  const paletteIndex = ref(0)
  const shortcutsOpen = ref(false)

  async function loadNotifs() { try { notifs.value = await NotificationsAPI.notifications() } catch { /* ignore */ } }
  async function markAllRead() { try { await NotificationsAPI.markAllNotificationsRead(); await loadNotifs() } catch { /* ignore */ } }
  function toggleNotif() { notifOpen.value = !notifOpen.value; if (notifOpen.value) loadNotifs() }
  function closeNotif() { notifOpen.value = false }
  function openSearch() { searchOpen.value = true; paletteIndex.value = 0 }
  function closeSearch() { searchOpen.value = false }
  function toggleShortcuts() { shortcutsOpen.value = !shortcutsOpen.value }
  function closeShortcuts() { shortcutsOpen.value = false }

  // 从 appSettings 载入 theme/workspace/privacy（登录后调）
  async function load() {
    try {
      const st = await AppAPI.getState()
      const as = (st as unknown as UiState).appSettings || {}
      if (as.theme === 'dark' || as.theme === 'light') theme.value = as.theme
      if (as.workspaceMode === 'work' || as.workspaceMode === 'personal') workspace.value = as.workspaceMode
      privacy.value = as.privacyMode != null ? !!as.privacyMode : false
      applyTheme(theme.value)
    } catch { /* ignore */ }
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    applyTheme(theme.value)
    SettingsAPI.updateSettings({ theme: theme.value }).catch(() => {})
  }
  function setWorkspace(ws: Workspace) { workspace.value = ws; SettingsAPI.updateSettings({ workspaceMode: ws }).catch(() => {}) }
  function togglePrivacy() { privacy.value = !privacy.value; SettingsAPI.updateSettings({ privacyMode: privacy.value }).catch(() => {}) }
  function go(v: string) { view.value = v }
  function openTask(id: string) { detailId.value = id }
  function closeDetail() { detailId.value = null }
  function setMobile(m: boolean) { isMobile.value = m }

  return { theme, workspace, privacy, view, isMobile, detailId, notifOpen, notifs, searchOpen, searchQuery, paletteIndex, shortcutsOpen, load, toggleTheme, setWorkspace, togglePrivacy, go, openTask, closeDetail, setMobile, loadNotifs, markAllRead, toggleNotif, closeNotif, openSearch, closeSearch, toggleShortcuts, closeShortcuts }
})
