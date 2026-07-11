// 认证令牌：localStorage 持久化 + 内存缓存。零业务语义。
// setToken/getToken 的单一来源；stores、admin/ 等均经本模块复用同一份令牌状态。
export const TOKEN_KEY = 'lx_token'

let TOKEN = ''
try { TOKEN = localStorage.getItem(TOKEN_KEY) || '' } catch { /* ignore */ }

export function setToken(t: string | null | undefined): void {
  TOKEN = t || ''
  try {
    if (TOKEN) localStorage.setItem(TOKEN_KEY, TOKEN)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* ignore */ }
}

export function getToken(): string {
  return TOKEN
}
