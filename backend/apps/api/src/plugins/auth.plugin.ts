import fp from 'fastify-plugin'
import { extractBearer, type AuthUser } from '@linx/platform-auth'

export interface AuthPluginOptions {
  /** 会话解析：token → 用户（通常来自 platform-auth SessionStore.resolve）。 */
  resolveSession: (token: string | undefined) => Promise<AuthUser | undefined>
  /** false 关闭 401 守卫（单测/开放模式），默认 true。 */
  requireAuth?: boolean
  /** 开放路径判定（收到【已解码】路径）；默认 /api/health + /api/auth（承接现网，带段边界）。 */
  isOpenPath?: (path: string) => boolean
}

/** 段边界前缀匹配：path === prefix 或 path 以 prefix + '/' 开头（杜绝 /api/authx 混淆为公开）。 */
function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}

function defaultOpen(path: string): boolean {
  return isUnder(path, '/api/health') || isUnder(path, '/api/auth')
}

/** 取路由实际匹配的路径：去 query + 单次 decode（对齐 find-my-way）；畸形编码返回 null（fail-closed）。 */
function routedPath(url: string): string | null {
  const raw = url.split('?', 1)[0] ?? ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

/**
 * 统一鉴权 preHandler（承接现网 app.js）：仅守 /api；Bearer → resolve → req.user；
 * 无有效会话且非开放路径 → 401。用 fastify-plugin 破封装 → 对全量路由（含 fall-through 到 legacy 的
 * 未迁移路由）生效，杜绝未迁移路由绕过鉴权。
 *
 * 安全要点：鉴权判定在【解码后的路径】上做——find-my-way 匹配前会 percent-decode，若在原始 url 上判
 * `startsWith('/api')` 会被 `/%61pi/tasks` 之类绕过（原始看似非 /api、路由解码后仍命中受保护 handler）。
 */
export const authPlugin = fp(
  async (app, opts: AuthPluginOptions) => {
    app.decorateRequest('user', null)
    const requireAuth = opts.requireAuth !== false
    const isOpen = opts.isOpenPath ?? defaultOpen

    app.addHook('preHandler', async (req, reply) => {
      const path = routedPath(req.url)
      if (path === null) {
        // 畸形 percent-encoding：fail-closed（守卫开启时拒绝）。
        if (requireAuth) return reply.status(400).send({ error: 'bad request', code: 'MALFORMED_URL' })
        return
      }
      if (!path.startsWith('/api')) return // 仅守 /api，探针/静态放行
      const token = extractBearer(req.headers.authorization)
      const user = await opts.resolveSession(token)
      if (user) {
        req.user = user
        return
      }
      req.user = null
      if (!isOpen(path) && requireAuth) {
        return reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
      }
    })
  },
  { name: 'auth' },
)
