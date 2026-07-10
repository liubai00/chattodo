// P4c-step1：认证 store（壳状态地基）。AppShell 将使用。
// 旧 App 的 authed/user/role + submitAuth/doLogout/componentDidMount(auth) 逻辑迁此。
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setToken, getToken } from '@/lib/api'

export interface AuthUser { name: string; accountName: string; email: string; role: string }

export const useAuthStore = defineStore('auth', () => {
  const authed = ref(false)
  const user = ref<AuthUser>({ name: '', accountName: '', email: '', role: 'member' })
  const canAdmin = computed(() => user.value.role === 'admin')
  const canEdit = computed(() => user.value.role !== 'viewer')

  function applyUser(u: any) {
    if (!u) return
    user.value = { name: u.name || '', accountName: u.accountName || u.name || '', email: u.email || '', role: u.role || 'member' }
  }

  // 启动：有 token 则 me() 取用户 + authed，失败清 token
  async function init() {
    if (!getToken()) { authed.value = false; return }
    try { const u = await api.me(); applyUser(u); authed.value = true }
    catch { setToken(''); authed.value = false }
  }

  async function login(email: string, pw: string) {
    const r: any = await api.login(email, pw)
    setToken(r.token); if (r.user) applyUser(r.user); authed.value = true
  }
  async function register(name: string, email: string, pw: string) {
    const r: any = await api.register(name, email, pw)
    setToken(r.token); applyUser(r.user); authed.value = true
  }
  async function logout() {
    await api.logout().catch(() => {})
    setToken('')
    authed.value = false
    user.value = { name: '', accountName: '', email: '', role: 'member' }
  }

  return { authed, user, canAdmin, canEdit, applyUser, init, login, register, logout }
})
