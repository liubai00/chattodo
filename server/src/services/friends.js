import { makeId, nowIso } from '../lib/ids.js'
import { publish } from './events.js'
import { pushNotification } from './collab.js'

// 好友关系服务。规则（PM 决策）：
// - 双向关系，每对用户全局唯一一行（方向由 requester/addressee 表达）。
// - 添加只支持「完整邮箱精确匹配」，不提供模糊搜索（防翻通讯录）。
// - 反向待处理（B 请求 A 时 A 也来请求 B）→ 视为双方同意，直接成为好友。
// - 拒绝不通知发起方（避免社交尴尬）；被拒后可再次发起（入口有限流）。
// - 解除好友：既有协作任务不受影响（工作连续性），但不能再发新邀请。

export async function getFriendship(db, a, b) {
  return db.get(
    `SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    [a, b, b, a],
  )
}

export async function areFriends(db, a, b) {
  if (!a || !b) return false
  if (a === b) return true
  const f = await getFriendship(db, a, b)
  return !!(f && f.status === 'accepted')
}

export async function friendIdsOf(db, userId) {
  const rows = await db.all(
    `SELECT requester_id, addressee_id FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`,
    [userId, userId],
  )
  return rows.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id))
}

// 好友总览：已接受 / 待我处理 / 我已发出。
export async function friendsOverview(db, userId) {
  const rows = await db.all(
    `SELECT f.*, ru.name AS r_name, ru.email AS r_email, au.name AS a_name, au.email AS a_email
       FROM friendships f
       LEFT JOIN users ru ON ru.id = f.requester_id
       LEFT JOIN users au ON au.id = f.addressee_id
      WHERE f.requester_id = ? OR f.addressee_id = ?
      ORDER BY f.created_at DESC`,
    [userId, userId],
  )
  const friends = []; const incoming = []; const outgoing = []
  for (const f of rows) {
    const otherIsAddressee = f.requester_id === userId
    const other = otherIsAddressee
      ? { id: f.addressee_id, name: f.a_name || '（已注销）', email: f.a_email || '' }
      : { id: f.requester_id, name: f.r_name || '（已注销）', email: f.r_email || '' }
    if (f.status === 'accepted') friends.push({ friendshipId: f.id, ...other, since: f.responded_at || f.created_at })
    else if (f.status === 'pending' && !otherIsAddressee) incoming.push({ friendshipId: f.id, ...other, at: f.created_at })
    else if (f.status === 'pending' && otherIsAddressee) outgoing.push({ friendshipId: f.id, ...other, at: f.created_at })
    // declined 行对双方都不展示（记录仅用于允许后续重新发起）
  }
  friends.sort((x, y) => (x.name || '').localeCompare(y.name || '', 'zh'))
  return { friends, incoming, outgoing }
}

// 按用户 id 发起好友请求（内部复用：@非好友 时的自动降级也走这里）。
export async function requestFriendByIdFx(db, user, targetUserId) {
  const target = await db.get(`SELECT id, name, email FROM users WHERE id = ?`, [targetUserId])
  if (!target) return { error: '用户不存在', code: 'not_found' }
  if (target.id === user.id) return { error: '不能添加自己为好友', code: 'self' }
  const existing = await getFriendship(db, user.id, target.id)
  const now = nowIso()
  const meName = user.name || '有人'

  const notifyRequest = async (friendshipId) => {
    await pushNotification(db, target.id, {
      type: 'friend', icon: 'ph-user-plus', color: 'var(--accent-ink)',
      text: `${meName} 请求加你为好友（通过后可互相 @提及与邀请协作）`,
      actionType: 'friend_request', actionRef: friendshipId,
    })
    publish(target.id, { kind: 'friends' })
  }

  if (!existing) {
    const id = makeId('fr')
    await db.run(`INSERT INTO friendships (id,requester_id,addressee_id,status,created_at) VALUES (?,?,?,'pending',?)`,
      [id, user.id, target.id, now])
    await notifyRequest(id)
    return { friendship: { id, status: 'pending' }, target }
  }
  if (existing.status === 'accepted') return { already: true, target }
  if (existing.status === 'pending') {
    if (existing.requester_id === user.id) return { pending: true, target } // 幂等：已发过
    // 对方早已向我发出请求 → 互有意愿，直接成为好友
    const r = await respondFriendFx(db, user, existing.id, true)
    return r ? { friendship: { id: existing.id, status: 'accepted' }, target, autoAccepted: true } : { error: '处理失败', code: 'conflict' }
  }
  // declined → 允许重新发起（方向翻转为当前发起人）
  await db.run(`UPDATE friendships SET requester_id = ?, addressee_id = ?, status = 'pending', created_at = ?, responded_at = NULL WHERE id = ?`,
    [user.id, target.id, now, existing.id])
  await notifyRequest(existing.id)
  return { friendship: { id: existing.id, status: 'pending' }, target }
}

// 按邮箱精确匹配发起好友请求（对外 API 入口）。
export async function requestFriendFx(db, user, email) {
  const em = String(email || '').trim().toLowerCase()
  if (!em || !em.includes('@')) return { error: '请输入对方的完整邮箱', code: 'bad_email' }
  const target = await db.get(`SELECT id FROM users WHERE lower(email) = ?`, [em])
  if (!target) return { error: '没有找到使用该邮箱的用户，请确认对方已注册', code: 'not_found' }
  return requestFriendByIdFx(db, user, target.id)
}

// 响应好友请求（addressee 视角）。accept: true | false。
export async function respondFriendFx(db, user, friendshipId, accept) {
  const f = await db.get(`SELECT * FROM friendships WHERE id = ?`, [friendshipId])
  if (!f || f.status !== 'pending' || f.addressee_id !== user.id) return null
  await db.run(`UPDATE friendships SET status = ?, responded_at = ? WHERE id = ?`,
    [accept ? 'accepted' : 'declined', nowIso(), friendshipId])
  // 我这边的请求通知置为已处理（按钮变灰）
  await db.run(`UPDATE notifications SET handled = 1, read = 1 WHERE action_ref = ? AND user_id = ?`, [friendshipId, user.id])
  const meName = user.name || '对方'
  if (accept) {
    const requester = await db.get(`SELECT id, name FROM users WHERE id = ?`, [f.requester_id])
    if (requester) {
      await pushNotification(db, requester.id, {
        type: 'friend', icon: 'ph-handshake', color: 'var(--accent)',
        text: `${meName} 通过了你的好友请求，现在可以互相 @提及与邀请协作了`,
      })
    }
    publish(f.requester_id, { kind: 'friends' })
  }
  // 拒绝：不通知发起方（静默），仅刷新自己的界面
  publish(user.id, { kind: 'friends' })
  return { friendship: { id: f.id, status: accept ? 'accepted' : 'declined' }, requesterId: f.requester_id }
}

// 解除好友 / 撤回自己发出的请求。
export async function removeFriendFx(db, user, friendshipId) {
  const f = await db.get(`SELECT * FROM friendships WHERE id = ?`, [friendshipId])
  if (!f) return null
  const isParty = f.requester_id === user.id || f.addressee_id === user.id
  if (!isParty) return null
  if (f.status === 'pending' && f.requester_id !== user.id) return null // 待处理请求只有发起方可撤回（接收方走拒绝）
  await db.run(`DELETE FROM friendships WHERE id = ?`, [f.id])
  // 撤回请求时，对方的请求通知置为已处理，避免点了报错
  await db.run(`UPDATE notifications SET handled = 1 WHERE action_ref = ?`, [f.id])
  const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id
  publish(otherId, { kind: 'friends' })
  publish(user.id, { kind: 'friends' })
  return { removed: true, otherId, wasPending: f.status === 'pending' }
}
