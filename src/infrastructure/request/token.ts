// 认证令牌：localStorage 持久化 + 内存缓存。零业务语义。
// 旧 api.ts 的 setToken/getToken 迁此；lib/api.ts 与 admin/ 均经本模块复用同一份令牌状态。
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
