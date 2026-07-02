import { makeId, nowIso } from '../lib/ids.js'
import { publish, publishMany } from './events.js'

const fmtDue = (iso) => {
  if (!iso) return '待定'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const pushNotification = (db, targetUserId, data) => {
  db.prepare(`INSERT INTO notifications (id,user_id,type,icon,color,text,read,action_type,action_ref,handled,created_at) VALUES (?,?,?,?,?,?,0,?,?,0,?)`)
    .run(makeId('nt'), targetUserId, data.type || 'assign', data.icon || 'ph-user-switch', data.color || 'var(--accent-ink)', data.text, data.actionType || null, data.actionRef || null, nowIso())
  publish(targetUserId, { kind: 'notify', text: data.text, actionType: data.actionType || null })
}
const pushChat = (db, targetUserId, text) => {
  db.prepare(`INSERT INTO chat_messages (id,user_id,role,text,is_error,created_at) VALUES (?,?,?,?,0,?)`)
    .run(makeId('msg'), targetUserId, 'agent', text, nowIso())
  publish(targetUserId, { kind: 'chat' })
}

export const findUserByName = (db, name) =>
  db.prepare(`SELECT id, name FROM users WHERE name = ?`).get(String(name || '').trim())

// 发出协作邀请（owner 视角）。返回 {collab, reused, userName} | {error}。
// 副作用：对方通知（可操作）+ 对方聊天注入邀请消息 + 本任务活动记录。
export function inviteFx(db, repos, user, taskId, targetUserId, { force = false } = {}) {
  const task = repos.tasks.get(taskId)
  if (!task || repos.tasks.access(taskId) !== 'owner') return { error: '任务不存在或无权邀请' }
  const target = db.prepare(`SELECT id, name FROM users WHERE id = ?`).get(targetUserId)
  if (!target) return { error: '成员不存在' }
  if (user && target.id === user.id) return { error: '不能邀请自己', bad: true }
  if (task.privacyScope === 'personal' && !force) return { error: '这是「个人」范围的任务，确认要邀请他人协作吗？', needConfirm: true }
  const r = repos.collaborators.invite(taskId, target.id)
  if (!r) return { error: '对方 24 小时内拒绝过该邀请，先线下沟通一下吧', cooldown: true }
  if (!r.reused) {
    const meName = (user && user.name) || '有人'
    repos.activity.log(taskId, `邀请 ${target.name} 协作`)
    pushNotification(db, target.id, {
      icon: 'ph-user-plus',
      text: `${meName} 邀请你协作「${task.title}」（截止 ${fmtDue(task.dueAt)}）`,
      actionType: 'invite', actionRef: r.collab.id,
    })
    pushChat(db, target.id, `${meName} 邀请你协作「${task.title}」（截止 ${fmtDue(task.dueAt)}）。\n回复「接受」列入你的任务并开启到期提醒，回复「拒绝」忽略；也可以在通知中心处理。`)
  }
  return { collab: r.collab, reused: r.reused, userName: target.name }
}

// 响应邀请（被邀请人视角）。mode: 'accept' | 'decline' | 'follow'（仅关注：收进展通知，不进我的 todo）。
// 副作用：消费通知 + 回执给邀请人 + 活动记录。
export function respondInviteFx(db, repos, user, inviteId, mode, remind = true) {
  if (mode === true) mode = 'accept'
  if (mode === false) mode = 'decline'
  const decision = mode === 'follow' ? 'following' : mode === 'accept' ? 'accepted' : 'declined'
  const before = repos.collaborators.get(inviteId)
  const updated = repos.collaborators.respond(inviteId, decision, remind)
  if (!updated) return null
  repos.notifications.markHandledByRef(updated.id)
  const meName = (user && user.name) || '对方'
  const task = db.prepare(`SELECT title FROM tasks WHERE id = ?`).get(updated.taskId)
  const title = task ? task.title : ''
  pushNotification(db, before.invitedBy, {
    icon: decision === 'declined' ? 'ph-x-circle' : decision === 'following' ? 'ph-eye' : 'ph-check-circle',
    color: decision === 'declined' ? 'var(--danger)' : 'var(--accent)',
    text: decision === 'accepted' ? `${meName} 接受了「${title}」的协作邀请`
      : decision === 'following' ? `${meName} 开始关注「${title}」（不参与执行，接收进展通知）`
        : `${meName} 婉拒了「${title}」的协作邀请`,
  })
  if (decision !== 'declined') {
    db.prepare(`INSERT INTO activity (id,user_id,task_id,text,created_at) VALUES (?,?,?,?,?)`)
      .run(makeId('act'), updated.userId, updated.taskId, decision === 'accepted' ? `${meName} 加入协作` : `${meName} 开始关注`, nowIso())
  }
  if (decision !== 'accepted') return { collab: updated, taskTitle: title, task: null }
  const owner = db.prepare(`SELECT name FROM users WHERE id = ?`).get(updated.ownerId)
  const fullTask = repos.tasks.get(updated.taskId)
  return { collab: updated, taskTitle: title, task: fullTask ? { ...fullTask, collabFrom: (owner && owner.name) || '', collabRemind: remind } : null }
}

// 共享任务完成 → 通知 owner + 协作者 + 关注者（排除操作者本人），并实时推送。
export function notifyTaskDoneFx(db, repos, user, taskId) {
  const task = db.prepare(`SELECT id, title FROM tasks WHERE id = ?`).get(taskId)
  if (!task) return
  const watchers = repos.collaborators.watchersOf(taskId).filter((uid) => !user || uid !== user.id)
  if (!watchers.length) return
  const meName = (user && user.name) || '有人'
  for (const uid of new Set(watchers)) {
    pushNotification(db, uid, { type: 'done', icon: 'ph-check-circle', color: 'var(--accent)', text: `${meName} 完成了「${task.title}」` })
  }
  publishMany(watchers, { kind: 'task', taskId })
}

// 记忆里的自动化规则："以后合同类的任务都邀请张伟" → {keyword:'合同', target:张伟}
export function maybeCreateAutoRule(db, repos, note) {
  const m = String(note || '').match(/(?:以后|今后|之后)[，,]?(.{1,16}?)(?:相关|类|方面)?的?任务[，,]?(?:都|一律|自动|记得)?(?:邀请|带上|抄送|叫上)\s*@?([^\s@，。,、!！?？]{1,20})/)
  if (!m) return null
  const keyword = m[1].trim().replace(/^(所有|全部)/, '')
  const target = findUserByName(db, m[2])
  if (!keyword || !target) return null
  const exists = repos.autoRules.all().some((r) => r.keyword === keyword && r.targetId === target.id)
  if (exists) return null
  return repos.autoRules.create(keyword, target.id, target.name)
}

// 新任务命中自动规则 → 自动发出协作邀请。返回 performed 条目数组。
export function applyAutoInvitesFx(db, repos, user, task, rawText) {
  const performed = []
  const hay = `${task.title} ${rawText || ''}`
  for (const rule of repos.autoRules.all()) {
    if (rule.action !== 'invite' || !rule.keyword) continue
    if (!hay.includes(rule.keyword)) continue
    if (user && rule.targetId === user.id) continue
    const r = inviteFx(db, repos, user, task.id, rule.targetId)
    if (r.collab && !r.reused) performed.push({ type: 'invite', auto: true, rule: rule.keyword, userId: rule.targetId, userName: rule.targetName, collabId: r.collab.id })
  }
  return performed
}

// 从文本里提取 @成员（精确匹配注册用户名）。
export function extractMentionedUsers(db, text) {
  const names = [...new Set([...String(text || '').matchAll(/@([^\s@，。,、.!！?？:：]{1,20})/g)].map((m) => m[1]))]
  const users = []
  for (const n of names) {
    const u = findUserByName(db, n)
    if (u) users.push(u)
  }
  return users
}
