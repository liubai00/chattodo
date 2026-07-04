import { makeId, nowIso } from '../lib/ids.js'
import { publish, publishMany } from './events.js'
import { areFriends, requestFriendByIdFx } from './friends.js'

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

// 把结构化 @提及（人/时间/文档）汇总成给 LLM 的分类清单，帮助模型区分意图。
export function summarizeMentions(mentions) {
  if (!Array.isArray(mentions) || !mentions.length) return ''
  const persons = mentions.filter((m) => m.type === 'person').map((m) => m.label).filter(Boolean)
  const times = mentions.filter((m) => m.type === 'time')
  const docs = mentions.filter((m) => m.type === 'doc')
  const lines = []
  if (persons.length) lines.push(`- 人（成员，需要协作时邀请，不是任务内容）：${persons.join('、')}`)
  if (times.length) lines.push(`- 时间（作为任务截止时间）：${times.map((t) => t.label || t.iso).join('、')}`)
  if (docs.length) lines.push(`- 文档/引用（已存在的内容，供参考）：${docs.map((d) => `${d.entityType === 'project' ? '项目' : d.entityType === 'note' ? '笔记' : '任务'}《${d.label}》`).join('、')}`)
  return lines.join('\n')
}

// 消息里的原始 @名字（可能匹配不到用户；用于识别"未知成员"）。
export function rawMentionNames(text) {
  return [...new Set([...String(text || '').matchAll(/@([^\s@，。,、.!！?？:：]{1,20})/g)].map((m) => m[1]))]
}

// 去掉 LLM 回复里关于"已邀请/已通知"的断言小句——这些常与真实结果不符，
// 统一改由 settleMentionedCollab 生成的权威状态行覆盖，杜绝自相矛盾。
// 按标点分句后剔除含断言关键词的句子，保留任务确认等其它内容。
export function stripInviteClaims(reply) {
  const claim = /(已邀请|邀请了|已通知|会通知|已叫上|已拉上|已抄送|已让.{0,8}协作|已安排.{0,6}(协作|参与)|已为你邀请|已帮你邀请)/
  return String(reply || '')
    .split('\n')
    .map((line) => {
      if (!claim.test(line)) return line
      const kept = line.split(/(?<=[，,。；;、])/).filter((seg) => !claim.test(seg)).join('')
      return kept.replace(/[，,、；;]\s*$/g, '。')
    })
    .join('\n')
    .replace(/。{2,}/g, '。')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 统一结算「@成员协作」意图：真实执行 + 生成与结果一致的状态行。
// 输出行只有三种口径：已邀请（好友）/ 待确认（非好友→已发好友请求）/ 无法邀请（未知成员）。
// structured：可选的结构化人 mention（[{type:'person',userId,label}]，来自前端选择器）。
export async function settleMentionedCollab({ db, repos, user, message, taskEntity, performed, structured = [] }) {
  const lines = []
  if (!db || !user) return { lines }

  const targets = new Map()          // userId → 展示名（称呼）
  const unknown = new Set()
  for (const m of Array.isArray(structured) ? structured : []) {
    if (!m || m.type !== 'person') continue
    if (m.userId) {
      const u = await db.get(`SELECT id, name FROM users WHERE id = ?`, [m.userId])
      if (u && u.id !== user.id) targets.set(u.id, u.name)
      else if (!u && m.label) unknown.add(m.label)
    } else if (m.label) unknown.add(m.label)
  }
  for (const nm of rawMentionNames(message)) {
    const u = await findUserByName(db, nm)
    if (u && u.id !== user.id) targets.set(u.id, u.name)
    else if (!u) unknown.add(nm)
  }
  if (!targets.size && !unknown.size) return { lines }

  const invitedIds = new Set(performed.filter((p) => p.type === 'invite').map((p) => p.userId))
  const friendReqIds = new Set(performed.filter((p) => p.type === 'friend_request').map((p) => p.userId))

  for (const [uid, name] of targets) {
    if (invitedIds.has(uid)) { lines.push(`🤝 已向 ${name} 发出协作邀请（待对方接受）`); continue }
    if (friendReqIds.has(uid)) { lines.push(`👋 ${name} 还不是你的好友——已发送好友请求，成为好友后即可邀请协作`); continue }
    if (await areFriends(db, user.id, uid)) {
      if (!taskEntity) { lines.push(`ℹ️ 已识别成员 ${name}，但本轮没有可邀请的任务`); continue }
      const r = await inviteFx(db, repos, user, taskEntity.entity.id, uid)
      if (r.collab) { performed.push({ type: 'invite', userId: uid, userName: name, collabId: r.collab.id, recovered: true }); lines.push(`🤝 已向 ${name} 发出协作邀请（待对方接受）`) }
      else if (r.needConfirm) lines.push(`⚠️ 「${taskEntity.entity.title}」是个人任务，未自动邀请 ${name}；如需协作请在任务详情里确认`)
      else if (r.reused) lines.push(`ℹ️ ${name} 已在该任务的协作名单里`)
      else lines.push(`⚠️ 未能邀请 ${name}：${r.error || '请稍后重试'}`)
    } else {
      const fr = await requestFriendByIdFx(db, user, uid)
      if (fr.autoAccepted) { performed.push({ type: 'friend_request', userId: uid, userName: name, auto: true }); lines.push(`🤝 你和 ${name} 互相请求过，已成为好友；再说一次即可邀请其协作`) }
      else if (fr.friendship || fr.pending) { performed.push({ type: 'friend_request', userId: uid, userName: name }); lines.push(`👋 ${name} 还不是你的好友——已发送好友请求，成为好友后即可邀请协作`) }
      else lines.push(`⚠️ 未能向 ${name} 发送好友请求：${fr.error || '请稍后重试'}`)
    }
  }
  for (const nm of unknown) {
    if ([...targets.values()].includes(nm)) continue
    lines.push(`⚠️ 没找到成员「${nm}」，未发出邀请——确认对方已注册、并且在你的好友列表里`)
  }
  return { lines }
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
