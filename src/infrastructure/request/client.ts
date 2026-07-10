// HTTP 底层客户端：fetch + Authorization + JSON + 非 2xx 抛错。零业务语义。
// 通用 JSON 请求入口；流式（SSE）场景由调用方自行 fetch（仍复用 apiUrl / getToken）。
import { getToken } from './token'

// Dev：相对 '/api' 经 Vite proxy 转发到后端。Prod（/todo/）：构建期设 VITE_API_BASE。
export const apiUrl = import.meta.env.VITE_API_BASE || '/api'

export interface RequestError extends Error {
  status: number
}

// 通用 JSON 请求：成功 resolve 解析后的 body（204 -> null），失败抛带 status 的 Error。
export async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  const token = getToken()
  if (token) headers.authorization = 'Bearer ' + token
  const res = await fetch(apiUrl + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json()).error || msg } catch { /* ignore */ }
    const err = new Error(msg) as RequestError
    err.status = res.status
    throw err
  }
  return (res.status === 204 ? null : await res.json()) as T
}
