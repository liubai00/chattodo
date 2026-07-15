import type { AuthUser } from '@linx/platform-auth'

// 全局增补 FastifyRequest.user（auth preHandler 解析会话后写入）。
declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null
  }
}

export {}
