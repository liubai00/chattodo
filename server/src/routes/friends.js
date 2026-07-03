import { config } from '../config.js'
import { isLimited } from '../lib/rateLimit.js'
import { friendsOverview, requestFriendFx, respondFriendFx, removeFriendFx } from '../services/friends.js'

// 好友关系：
//   GET    /api/friends              — 好友 / 待我处理 / 我已发出
//   POST   /api/friends/request      — {email} 按完整邮箱精确添加（限流防骚扰/枚举）
//   POST   /api/friends/:id/respond  — {accept} 接受 / 拒绝
//   DELETE /api/friends/:id          — 解除好友 / 撤回自己发出的请求
export default async function friendRoutes(app) {
  const me = (req) => req.user || { id: config.defaultUserId, name: '演示用户' }

  app.get('/api/friends', async (req) => friendsOverview(app.db, me(req).id))

  app.post('/api/friends/request', async (req, reply) => {
    const user = me(req)
    if (isLimited('friendreq:' + user.id, 15, 60_000)) {
      return reply.status(429).send({ error: '好友请求发送太频繁，稍后再试' })
    }
    const r = await requestFriendFx(app.db, user, (req.body || {}).email)
    if (r.error) return reply.status(r.code === 'not_found' ? 404 : 400).send({ error: r.error })
    return r
  })

  app.post('/api/friends/:id/respond', async (req, reply) => {
    const accept = !!(req.body && req.body.accept)
    const r = await respondFriendFx(app.db, me(req), req.params.id, accept)
    if (!r) return reply.status(404).send({ error: '请求不存在或已处理' })
    return r
  })

  app.delete('/api/friends/:id', async (req, reply) => {
    const r = await removeFriendFx(app.db, me(req), req.params.id)
    if (!r) return reply.status(404).send({ error: '关系不存在或无权操作' })
    return r
  })
}
