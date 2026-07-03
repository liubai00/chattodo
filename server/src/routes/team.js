import { config } from '../config.js'
import { friendIdsOf } from '../services/friends.js'

// 选人目录（指派 / @提及 / 协作邀请候选）：只返回「自己 + 已接受的好友」。
// 全量用户目录只存在于管理员后台（/api/admin/*），普通成员不能枚举注册用户。
export default async function teamRoutes(app) {
  app.get('/api/team', async (req) => {
    const meId = req.user ? req.user.id : config.defaultUserId
    const ids = [meId, ...(await friendIdsOf(app.db, meId))]
    const marks = ids.map(() => '?').join(',')
    const users = await app.db.all(
      `SELECT id, name, email, role, created_at FROM users WHERE id IN (${marks}) ORDER BY created_at`, ids)
    return { users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.created_at })) }
  })
}
