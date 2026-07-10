// 认证域 API：注册 / 登录 / 登出 / 当前用户 / 改密。
import { request } from '@/infrastructure/request'
import type { User } from '@/types/api'

export const AuthAPI = {
  register: (name: string, email: string, password: string) => request<User>('POST', '/auth/register', { name, email, password }),
  login: (email: string, password: string) => request<{ token: string; user?: User }>('POST', '/auth/login', { email, password }),
  logout: () => request<null>('POST', '/auth/logout'),
  me: () => request<User>('GET', '/auth/me'),
  updateMe: (patch: Partial<User>) => request<User>('PATCH', '/auth/me', patch),
  changePassword: (oldPassword: string, newPassword: string) => request<unknown>('POST', '/auth/password', { oldPassword, newPassword }),
}
