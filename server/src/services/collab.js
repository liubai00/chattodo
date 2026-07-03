import { makeId, nowIso } from '../lib/ids.js'
import { publish, publishMany } from './events.js'
import { areFriends } from './friends.js'

const fmtDue = (iso) => {
  if (!iso) return '待定'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const pushNotification = async (db, targetUserId, data) => {
  await db.run(`INSERT INTO notifications (id,user_id,type,icon,color,text,read,action_type,action_ref,handled,created_at) VALUES (?,?,?,?,?,?,0,?,?,0,?)`,
    [makeId('nt'), targetUserId, data.type || 'assign', data.icon || 'ph-user-switch', data.color || 'var(--accent-ink)', data.text, data.actionType || null, data.actionRef || null, nowIso()])
  publish(targetUserId, { kind: 'notify', text: data.text, actionType: data.actionType || null })
}
export const pushChat = async (db, targetUserId, text) => {
  await db.run(`INSERT INTO chat_messages (id,user_id,role,text,is_error,created_at) VALUES (?,?,?,?,0,?)`,
    [makeId('msg'), targetUserId, 'agent', text, nowIso()])
  publish(targetUserId, { kind: 'chat' })
}

export const findUserByName = (db, name) =>
  db.get(`SELECT id, name FROM users WHERE name = ?`, [String(name || '').trim()])

// 发出协作邀请（owner 视角）。返回 {collab, reused, userName} | {error}。
export async function inviteFx(db, repos, user, taskId, targetUserId, { force = false } = {}) {
  const task = await repos.tasks.get(taskId)
  if (!task || (await repos.tasks.access(taskId)) !== 'owner') return { error: '任务不存在或无权邀请' }
  const target = await db.get(`SELECT id, name FROM users WHERE id = ?`, [targetUserId])
  if (!target) return { error: '成员不存在' }
  if (user && target.id === user.id) return { error: '不能邀请自己', bad: true }
  // 好友圈收口：协作邀请只能发给已接受的好友（服务端强制；user 缺省 = 单用户/测试模式，跳过）
  if (user && !(await areFriends(db, user.id, target.id))) {
    return { error: `你和 ${target.name} 还不是好友，先添加好友后才能邀请协作`, notFriend: true, targetId: target.id, targetName: target.name }
  }
  if (task.privacyScope === 'personal' && !force) return { error: '这是「个人」范围的任务，确认要邀请他人协作吗？', needConfirm: true }
  const r = await repos.collaborators.invite(taskId, target.id)
  if (!r) return { error: '对方 24 小时内拒绝过该邀请，先线下沟通一下吧', cooldown: true }
  if (!r.reused) {
    const meName = (user && user.name) || '有人'
    await repos.activity.log(taskId, `邀请 ${target.name} 协作`)
    await pushNotification(db, target.id, {
      icon: 'ph-user-plus',
      text: `${meName} 邀请你协作「${task.title}」（截止 ${fmtDue(task.dueAt)}）`,
      actionType: 'invite', actionRef: r.collab.id,
    })
    await pushChat(db, target.id, `${meName} 邀请你协作「${task.title}」（截止 ${fmtDue(task.dueAt)}）。\n回复「接受」列入你的任务并开启到期提醒，回复「拒绝」忽略；也可以在通知中心处理。`)
  }
  return { collab: r.collab, reused: r.reused, userName: target.name }
}

// 响应邀请（被邀请人视角）。mode: 'accept' | 'decline' | 'follow'。
export async function respondInviteFx(db, repos, user, inviteId, mode, remind = true) {
  if (mode === true) mode = 'accept'
  if (mode === false) mode = 'decline'
  const decision = mode === 'follow' ? 'following' : mode === 'accept' ? 'accepted' : 'declined'
  const before = await repos.collaborators.get(inviteId)
  const updated = await repos.collaborators.respond(inviteId, decision, remind)
  if (!updated) return null
  await repos.notifications.markHandledByRef(updated.id)
  const meName = (user && user.name) || '对方'
  const task = await db.get(`SELECT title FROM tasks WHERE id = ?`, [updated.taskId])
  const title = task ? task.title : ''
  await pushNotification(db, before.invitedBy, {
    icon: decision === 'declined' ? 'ph-x-circle' : decision === 'following' ? 'ph-eye' : 'ph-check-circle',
    color: decision === 'declined' ? 'var(--danger)' : 'var(--accent)',
    text: decision === 'accepted' ? `${meName} 接受了「${title}」的协作邀请`
      : decision === 'following' ? `${meName} 开始关注「${title}」（不参与执行，接收进展通知）`
        : `${meName} 婉拒了「${title}」的协作邀请`,
  })
  if (decision !== 'declined') {
    await db.run(`INSERT INTO activity (id,user_id,task_id,text,created_at) VALUES (?,?,?,?,?)`,
      [makeId('act'), updated.userId, updated.taskId, decision === 'accepted' ? `${meName} 加入协作` : `${meName} 开始关注`, nowIso()])
  }
  if (decision !== 'accepted') return { collab: updated, taskTitle: title, task: null }
  const owner = await db.get(`SELECT name FROM users WHERE id = ?`, [updated.ownerId])
  const fullTask = await repos.tasks.get(updated.taskId)
  return { collab: updated, taskTitle: title, task: fullTask ? { ...fullTask, collabFrom: (owner && owner.name) || '', collabRemind: remind } : null }
}

// 共享任务完成 → 通知 owner + 协作者 + 关注者（排除操作者本人），并实时推送。
export async function notifyTaskDoneFx(db, repos, user, taskId) {
  const task = await db.get(`SELECT id, title FROM tasks WHERE id = ?`, [taskId])
  if (!task) return
  const watchers = (await repos.collaborators.watchersOf(taskId)).filter((uid) => !user || uid !== user.id)
  if (!watchers.length) return
  const meName = (user && user.name) || '有人'
  for (const uid of new Set(watchers)) {
    await pushNotification(db, uid, { type: 'done', icon: 'ph-check-circle', color: 'var(--accent)', text: `${meName} 完成了「${task.title}」` })
  }
  publishMany(watchers, { kind: 'task', taskId })
}

// 记忆里的自动化规则："以后合同类的任务都邀请张伟" → 建 auto_rule
// user 传入时，规则对象必须是自己的好友（与邀请同一收口）。
export async function maybeCreateAutoRule(db, repos, note, user) {
  const m = String(note || '').match(/(?:以后|今后|之后)[，,]?(.{1,16}?)(?:相关|类|方面)?的?任务[，,]?(?:都|一律|自动|记得)?(?:邀请|带上|抄送|叫上)\s*@?([^\s@，。,、!！?？]{1,20})/)
  if (!m) return null
  const keyword = m[1].trim().replace(/^(所有|全部)/, '')
  const target = await findUserByName(db, m[2])
  if (!keyword || !target) return null
  if (user && !(await areFriends(db, user.id, target.id))) return null
  const exists = (await repos.autoRules.all()).some((r) => r.keyword === keyword && r.targetId === target.id)
  if (exists) return null
  return repos.autoRules.create(keyword, target.id, target.name)
}

// 新任务命中自动规则 → 自动发出协作邀请。返回 performed 条目数组。
export async function applyAutoInvitesFx(db, repos, user, task, rawText) {
  const performed = []
  const hay = `${task.title} ${rawText || ''}`
  for (const rule of await repos.autoRules.all()) {
    if (rule.action !== 'invite' || !rule.keyword) continue
    if (!hay.includes(rule.keyword)) continue
    if (user && rule.targetId === user.id) continue
    const r = await inviteFx(db, repos, user, task.id, rule.targetId)
    if (r.collab && !r.reused) performed.push({ type: 'invite', auto: true, rule: rule.keyword, userId: rule.targetId, userName: rule.targetName, collabId: r.collab.id })
  }
  return performed
}

// 从文本里提取 @成员（精确匹配注册用户名）。
// forUser 传入时给每个命中的用户标注 isFriend，调用方据此决定：好友 → 直接邀请；
// 非好友 → 降级为先发好友请求（不暴露邮箱等信息）。
export async function extractMentionedUsers(db, text, forUser) {
  const names = [...new Set([...String(text || '').matchAll(/@([^\s@，。,、.!！?？:：]{1,20})/g)].map((m) => m[1]))]
  const users = []
  for (const n of names) {
    const u = await findUserByName(db, n)
    if (!u) continue
    if (forUser && u.id === forUser.id) continue
    users.push({ ...u, isFriend: forUser ? await areFriends(db, forUser.id, u.id) : true })
  }
  return users
}
