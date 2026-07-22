// 认证 store（壳状态地基）。AppShell 使用。
// 旧 App 的 authed/user/role + submitAuth/doLogout/componentDidMount(auth) 逻辑迁此。
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { AuthAPI } from '@/modules/auth/api'
import { setToken, getToken } from '@/infrastructure/request'
import type { User } from '@/types/api'

export interface AuthUser { name: string; accountName: string; email: string; role: string }

// login/register 后端返回 { token, user? }（register 的类型签名偏松，按真实形状收窄）。
interface AuthResult { token: string; user?: User }

export const useAuthStore = defineStore('auth', () => {
  const authed = ref(false)
  const user = ref<AuthUser>({ name: '', accountName: '', email: '', role: 'member' })
  const canAdmin = computed(() => user.value.role === 'admin')
  const canEdit = computed(() => user.value.role !== 'viewer')

  function applyUser(u: User | null | undefined) {
    if (!u) return
    user.value = { name: u.name || '', accountName: u.accountName || u.name || '', email: u.email || '', role: u.role || 'member' }
  }

  // 启动：有 token 则 me() 取用户 + authed，失败清 token
  async function init() {
    if (!getToken()) { authed.value = false; return }
    try { const u = await AuthAPI.me(); applyUser(u); authed.value = true }
    catch { setToken(''); authed.value = false }
  }

  async function login(email: string, pw: string) {
    const r: AuthResult = await AuthAPI.login(email, pw)
    setToken(r.token); if (r.user) applyUser(r.user); authed.value = true
  }
  async function register(name: string, email: string, pw: string, inviteToken?: string) {
    const r = await AuthAPI.register(name, email, pw, inviteToken) as AuthResult
    setToken(r.token); applyUser(r.user); authed.value = true
  }
  async function logout() {
    await AuthAPI.logout().catch(() => {})
    setToken('')
    authed.value = false
    user.value = { name: '', accountName: '', email: '', role: 'member' }
  }

  return { authed, user, canAdmin, canEdit, applyUser, init, login, register, logout }
})
