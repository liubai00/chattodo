import { makeId, nowIso } from '../lib/ids.js'
import { config } from '../config.js'

// ---- row -> domain mappers (snake_case -> camelCase, matching the frontend shape) ----
const toTask = (r) => r && {
  id: r.id, title: r.title, notes: r.notes, status: r.status,
  projectId: r.project_id, tags: JSON.parse(r.tags || '[]'), context: r.context,
  dueAt: r.due_at, plannedAt: r.planned_at, durationMinutes: r.duration_minutes,
  priority: r.priority, privacyScope: r.privacy_scope, sourceIdeaId: r.source_idea_id,
  assignee: r.assignee || null, createdAt: r.created_at, updatedAt: r.updated_at,
}
const toIdea = (r) => r && {
  id: r.id, title: r.title, rawText: r.raw_text, status: r.status,
  suggestedNextAction: r.suggested_next_action, aiReason: r.ai_reason,
  privacyScope: r.privacy_scope, source: r.source, createdAt: r.created_at, updatedAt: r.updated_at,
}
const toNon = (r) => r && {
  id: r.id, title: r.title, summary: r.summary, rawText: r.raw_text, reason: r.reason,
  suggestedDestination: r.suggested_destination, privacyScope: r.privacy_scope, source: r.source,
  corrected: !!r.corrected, createdAt: r.created_at, updatedAt: r.updated_at,
}
const toProject = (r) => r && {
  id: r.id, name: r.name, description: r.description, status: r.status,
  privacyScope: r.privacy_scope, createdAt: r.created_at, updatedAt: r.updated_at,
}
const toAgent = (r) => r && {
  soul: r.soul, memory: r.memory, preferences: r.preferences, workingStyle: r.working_style,
  privacyRules: r.privacy_rules, defaultFollowupStrategy: r.default_followup_strategy, updatedAt: r.updated_at,
}
const toSettings = (r) => {
  if (!r) return r
  let notifPrefs = {}
  try { notifPrefs = JSON.parse(r.notif_prefs || '{}') } catch { /* keep {} */ }
  return {
    workspaceMode: r.workspace_mode, privacyMode: !!r.privacy_mode, defaultView: r.default_view,
    aiVisibility: r.ai_visibility, notifPrefs, theme: r.theme || 'light', updatedAt: r.updated_at,
  }
}
const toChat = (r) => r && { id: r.id, role: r.role, text: r.text, isError: !!r.is_error, createdAt: r.created_at }
const toRecord = (r) => r && {
  id: r.id, rawInput: r.raw_input, source: r.source, aiKind: r.ai_kind, confidence: r.confidence,
  aiReason: r.ai_reason, resultEntityType: r.result_entity_type, resultEntityId: r.result_entity_id,
  status: r.status, createdAt: r.created_at,
}

const toAiConfig = (r) => r && {
  provider: r.provider, baseUrl: r.base_url, model: r.model, apiKey: r.api_key,
  fallbackToRule: !!r.fallback_to_rule, updatedAt: r.updated_at,
}

// generic dynamic UPDATE builder
function applyUpdate(db, table, id, userId, patch, fieldMap, serialize = (k, v) => v) {
  const sets = []
  const vals = []
  for (const [k, col] of Object.entries(fieldMap)) {
    if (k in patch) { sets.push(`${col} = ?`); vals.push(serialize(k, patch[k])) }
  }
  sets.push('updated_at = ?'); vals.push(nowIso())
  vals.push(id, userId)
  db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals)
}

const TASK_FIELDS = {
  title: 'title', notes: 'notes', status: 'status', projectId: 'project_id', tags: 'tags',
  context: 'context', dueAt: 'due_at', plannedAt: 'planned_at', durationMinutes: 'duration_minutes',
  priority: 'priority', privacyScope: 'privacy_scope', sourceIdeaId: 'source_idea_id', assignee: 'assignee',
}
const serTask = (k, v) => (k === 'tags' ? JSON.stringify(v ?? []) : v)

const toSub = (r) => r && { id: r.id, text: r.text, done: !!r.done, createdAt: r.created_at }
const toComment = (r) => r && { id: r.id, author: r.author, text: r.text, createdAt: r.created_at }
const toAct = (r) => r && { id: r.id, text: r.text, createdAt: r.created_at }
const toNotif = (r) => r && { id: r.id, type: r.type, icon: r.icon, color: r.color, text: r.text, read: !!r.read, actionType: r.action_type || null, actionRef: r.action_ref || null, handled: !!r.handled, createdAt: r.created_at }
const toCollab = (r) => r && { id: r.id, taskId: r.task_id, ownerId: r.owner_id, userId: r.user_id, invitedBy: r.invited_by, status: r.status, remind: !!r.remind, createdAt: r.created_at, respondedAt: r.responded_at }

export function makeRepos(db, userId = config.defaultUserId) {
  const projects = {
    all: () => db.prepare(`SELECT * FROM projects WHERE user_id = ? ORDER BY created_at`).all(userId).map(toProject),
    get: (id) => toProject(db.prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`).get(id, userId)),
    create(data) {
      const id = data.id || makeId('proj')
      const ts = nowIso()
      db.prepare(`INSERT INTO projects (id,user_id,name,description,status,privacy_scope,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, userId, data.name, data.description ?? '', data.status ?? 'active', data.privacyScope ?? 'work', ts, ts)
      return this.get(id)
    },
  }

  // 任务访问级别：owner（自己的）| collaborator（已接受协作）| null（无权）。
  const taskAccess = (taskId) => {
    const row = db.prepare(`SELECT user_id FROM tasks WHERE id = ?`).get(taskId)
    if (!row) return null
    if (row.user_id === userId) return 'owner'
    const c = db.prepare(`SELECT 1 FROM task_collaborators WHERE task_id = ? AND user_id = ? AND status = 'accepted'`).get(taskId, userId)
    return c ? 'collaborator' : null
  }

  const tasks = {
    // 可见集 = 自己的 + 已接受协作的（协作任务在业务层带 collab 标记）
    all: () => db.prepare(`SELECT * FROM tasks WHERE user_id = ? OR id IN (SELECT task_id FROM task_collaborators WHERE user_id = ? AND status = 'accepted') ORDER BY created_at DESC`).all(userId, userId).map(toTask),
    get(id) {
      const access = taskAccess(id)
      if (!access) return undefined
      return toTask(db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id))
    },
    access: taskAccess,
    create(data) {
      const id = data.id || makeId('task')
      const ts = nowIso()
      db.prepare(`INSERT INTO tasks (id,user_id,title,notes,status,project_id,tags,context,due_at,planned_at,duration_minutes,priority,privacy_scope,source_idea_id,created_at,updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, userId, data.title, data.notes ?? '', data.status ?? 'todo', data.projectId ?? null,
          JSON.stringify(data.tags ?? []), data.context ?? '', data.dueAt ?? null, data.plannedAt ?? null,
          data.durationMinutes ?? null, data.priority ?? 3, data.privacyScope ?? 'work', data.sourceIdeaId ?? null, ts, ts)
      return this.get(id)
    },
    // owner 全字段可改；协作者只允许改状态（完成/进行中）。
    update(id, patch) {
      const access = taskAccess(id)
      if (!access) return undefined
      if (access === 'owner') { applyUpdate(db, 'tasks', id, userId, patch, TASK_FIELDS, serTask); return this.get(id) }
      if ('status' in patch) db.prepare(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`).run(patch.status, nowIso(), id)
      return this.get(id)
    },
    remove: (id) => db.prepare(`DELETE FROM tasks WHERE id = ? AND user_id = ?`).run(id, userId), // owner only
  }

  const ideas = {
    all: () => db.prepare(`SELECT * FROM todo_ideas WHERE user_id = ? ORDER BY created_at DESC`).all(userId).map(toIdea),
    get: (id) => toIdea(db.prepare(`SELECT * FROM todo_ideas WHERE id = ? AND user_id = ?`).get(id, userId)),
    create(data) {
      const id = data.id || makeId('idea')
      const ts = nowIso()
      db.prepare(`INSERT INTO todo_ideas (id,user_id,title,raw_text,status,suggested_next_action,ai_reason,privacy_scope,source,created_at,updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, userId, data.title, data.rawText ?? '', data.status ?? 'clarifying', data.suggestedNextAction ?? '',
          data.aiReason ?? '', data.privacyScope ?? 'work', data.source ?? 'chat', ts, ts)
      return this.get(id)
    },
    update(id, patch) {
      applyUpdate(db, 'todo_ideas', id, userId, patch, { title: 'title', status: 'status', suggestedNextAction: 'suggested_next_action', aiReason: 'ai_reason', privacyScope: 'privacy_scope' })
      return this.get(id)
    },
    remove: (id) => db.prepare(`DELETE FROM todo_ideas WHERE id = ? AND user_id = ?`).run(id, userId),
  }

  const nonTodos = {
    all: () => db.prepare(`SELECT * FROM non_todo_outputs WHERE user_id = ? ORDER BY created_at DESC`).all(userId).map(toNon),
    get: (id) => toNon(db.prepare(`SELECT * FROM non_todo_outputs WHERE id = ? AND user_id = ?`).get(id, userId)),
    create(data) {
      const id = data.id || makeId('non')
      const ts = nowIso()
      db.prepare(`INSERT INTO non_todo_outputs (id,user_id,title,summary,raw_text,reason,suggested_destination,privacy_scope,source,corrected,created_at,updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, userId, data.title, data.summary ?? '', data.rawText ?? '', data.reason ?? '',
          data.suggestedDestination ?? 'archive', data.privacyScope ?? 'work', data.source ?? 'chat', data.corrected ? 1 : 0, ts, ts)
      return this.get(id)
    },
    remove: (id) => db.prepare(`DELETE FROM non_todo_outputs WHERE id = ? AND user_id = ?`).run(id, userId),
  }

  const agent = {
    get: () => toAgent(db.prepare(`SELECT * FROM agent_profile WHERE user_id = ?`).get(userId)),
    update(patch) {
      const map = {
        soul: 'soul', memory: 'memory', preferences: 'preferences', workingStyle: 'working_style',
        privacyRules: 'privacy_rules', defaultFollowupStrategy: 'default_followup_strategy',
      }
      const sets = []; const vals = []
      for (const [k, col] of Object.entries(map)) {
        if (k in patch) { sets.push(`${col} = ?`); vals.push(patch[k]) }
      }
      sets.push('updated_at = ?'); vals.push(nowIso())
      vals.push(userId)
      db.prepare(`UPDATE agent_profile SET ${sets.join(', ')} WHERE user_id = ?`).run(...vals)
      return this.get()
    },
  }

  const settings = {
    get: () => toSettings(db.prepare(`SELECT * FROM app_settings WHERE user_id = ?`).get(userId)),
    update(patch) {
      const map = { workspaceMode: 'workspace_mode', privacyMode: 'privacy_mode', defaultView: 'default_view', aiVisibility: 'ai_visibility', notifPrefs: 'notif_prefs', theme: 'theme' }
      const sets = []; const vals = []
      for (const [k, col] of Object.entries(map)) {
        if (k in patch) { sets.push(`${col} = ?`); vals.push(k === 'privacyMode' ? (patch[k] ? 1 : 0) : k === 'notifPrefs' ? JSON.stringify(patch[k] || {}) : patch[k]) }
      }
      sets.push('updated_at = ?'); vals.push(nowIso())
      vals.push(userId)
      db.prepare(`UPDATE app_settings SET ${sets.join(', ')} WHERE user_id = ?`).run(...vals)
      return this.get()
    },
  }

  const captureRecords = {
    create(data) {
      const id = data.id || makeId('rec')
      db.prepare(`INSERT INTO capture_records (id,user_id,raw_input,source,ai_kind,confidence,ai_reason,result_entity_type,result_entity_id,status,created_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, userId, data.rawInput, data.source ?? 'chat', data.aiKind, data.confidence ?? null, data.aiReason ?? '',
          data.resultEntityType ?? null, data.resultEntityId ?? null, data.status ?? 'ok', nowIso())
      return toRecord(db.prepare(`SELECT * FROM capture_records WHERE id = ?`).get(id))
    },
    getByEntity: (type, id) => toRecord(db.prepare(`SELECT * FROM capture_records WHERE user_id = ? AND result_entity_type = ? AND result_entity_id = ? ORDER BY created_at DESC LIMIT 1`).get(userId, type, id)),
    // Re-point a record at a new entity (used by move-out to preserve traceability).
    relink: (oldEntityId, newType, newId) =>
      db.prepare(`UPDATE capture_records SET result_entity_type = ?, result_entity_id = ? WHERE user_id = ? AND result_entity_id = ?`).run(newType, newId, userId, oldEntityId),
    all: () => db.prepare(`SELECT * FROM capture_records WHERE user_id = ? ORDER BY created_at DESC`).all(userId).map(toRecord),
  }

  const corrections = {
    create(data) {
      const id = data.id || makeId('corr')
      db.prepare(`INSERT INTO corrections (id,user_id,entity_type,entity_id,from_kind,to_kind,note,created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, userId, data.entityType, data.entityId, data.fromKind ?? null, data.toKind ?? null, data.note ?? '', nowIso())
      return id
    },
    all: () => db.prepare(`SELECT * FROM corrections WHERE user_id = ? ORDER BY created_at DESC`).all(userId),
  }

  const aiErrors = {
    create(data) {
      const id = data.id || makeId('err')
      db.prepare(`INSERT INTO ai_errors (id,user_id,raw_input,message,created_at) VALUES (?,?,?,?,?)`)
        .run(id, userId, data.rawInput ?? '', data.message ?? '', nowIso())
      return id
    },
    all: () => db.prepare(`SELECT * FROM ai_errors WHERE user_id = ? ORDER BY created_at DESC`).all(userId),
  }

  const chat = {
    all: () => db.prepare(`SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at`).all(userId).map(toChat),
    create(data) {
      const id = data.id || makeId('msg')
      db.prepare(`INSERT INTO chat_messages (id,user_id,role,text,is_error,created_at) VALUES (?,?,?,?,?,?)`)
        .run(id, userId, data.role, data.text, data.isError ? 1 : 0, nowIso())
      return toChat(db.prepare(`SELECT * FROM chat_messages WHERE id = ?`).get(id))
    },
  }

  const AI_DEFAULTS = { provider: 'rule', baseUrl: '', model: '', apiKey: '', fallbackToRule: true, updatedAt: null }
  const aiWrite = (rowId, patch) => {
    db.prepare(`INSERT OR IGNORE INTO ai_config (id, updated_at) VALUES (?, ?)`).run(rowId, nowIso())
    const map = { provider: 'provider', baseUrl: 'base_url', model: 'model', apiKey: 'api_key', fallbackToRule: 'fallback_to_rule' }
    const sets = []; const vals = []
    for (const [k, col] of Object.entries(map)) {
      if (k in patch) { sets.push(`${col} = ?`); vals.push(k === 'fallbackToRule' ? (patch[k] ? 1 : 0) : patch[k]) }
    }
    sets.push('updated_at = ?'); vals.push(nowIso())
    vals.push(rowId)
    db.prepare(`UPDATE ai_config SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  }
  const aiConfig = {
    // Team config ('default' row) + optional per-user override row ('u:<id>').
    getTeam: () => toAiConfig(db.prepare(`SELECT * FROM ai_config WHERE id = 'default'`).get()) || { ...AI_DEFAULTS },
    getOwn: () => toAiConfig(db.prepare(`SELECT * FROM ai_config WHERE id = ?`).get('u:' + userId)),
    // Effective config: personal override wins, else team.
    get() { return this.getOwn() || this.getTeam() },
    update(patch) { aiWrite('default', patch); return this.getTeam() }, // admin: team row
    updateOwn(patch) { aiWrite('u:' + userId, patch); return this.getOwn() },
    clearOwn() { db.prepare(`DELETE FROM ai_config WHERE id = ?`).run('u:' + userId) },
  }

  // 子任务/评论/活动属于任务本身（不是查看者）：有任务访问权即可读写，作者身份仍记在行上。
  const subtasks = {
    byTask: (taskId) => taskAccess(taskId) ? db.prepare(`SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at`).all(taskId).map(toSub) : [],
    create(taskId, text) { if (!taskAccess(taskId)) return null; const id = makeId('sub'); db.prepare(`INSERT INTO subtasks (id,user_id,task_id,text,done,created_at) VALUES (?,?,?,?,0,?)`).run(id, userId, taskId, text, nowIso()); return toSub(db.prepare(`SELECT * FROM subtasks WHERE id = ?`).get(id)) },
    toggle(id) { const r = db.prepare(`SELECT task_id, done FROM subtasks WHERE id = ?`).get(id); if (!r || !taskAccess(r.task_id)) return null; db.prepare(`UPDATE subtasks SET done = ? WHERE id = ?`).run(r.done ? 0 : 1, id); return toSub(db.prepare(`SELECT * FROM subtasks WHERE id = ?`).get(id)) },
    remove(id) { const r = db.prepare(`SELECT task_id FROM subtasks WHERE id = ?`).get(id); if (r && taskAccess(r.task_id)) db.prepare(`DELETE FROM subtasks WHERE id = ?`).run(id) },
  }
  const comments = {
    byTask: (taskId) => taskAccess(taskId) ? db.prepare(`SELECT * FROM comments WHERE task_id = ? ORDER BY created_at`).all(taskId).map(toComment) : [],
    create(taskId, author, text) { if (!taskAccess(taskId)) return null; const id = makeId('cmt'); db.prepare(`INSERT INTO comments (id,user_id,task_id,author,text,created_at) VALUES (?,?,?,?,?,?)`).run(id, userId, taskId, author, text, nowIso()); return toComment(db.prepare(`SELECT * FROM comments WHERE id = ?`).get(id)) },
  }
  const activity = {
    byTask: (taskId) => taskAccess(taskId) ? db.prepare(`SELECT * FROM activity WHERE task_id = ? ORDER BY created_at DESC`).all(taskId).map(toAct) : [],
    log(taskId, text) { const id = makeId('act'); db.prepare(`INSERT INTO activity (id,user_id,task_id,text,created_at) VALUES (?,?,?,?,?)`).run(id, userId, taskId, text, nowIso()); return id },
  }

  // 协作关系：邀请-确认制。幂等邀请、拒后 24h 冷却、可随时退出。
  const collaborators = {
    forTask: (taskId) => db.prepare(`SELECT c.*, u.name AS user_name FROM task_collaborators c LEFT JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.created_at`).all(taskId)
      .map((r) => ({ ...toCollab(r), userName: r.user_name || r.user_id })),
    myPending: () => db.prepare(`SELECT c.*, t.title AS task_title, t.due_at AS task_due, u.name AS inviter_name
                                 FROM task_collaborators c JOIN tasks t ON t.id = c.task_id LEFT JOIN users u ON u.id = c.invited_by
                                 WHERE c.user_id = ? AND c.status = 'pending' ORDER BY c.created_at DESC`).all(userId)
      .map((r) => ({ ...toCollab(r), taskTitle: r.task_title, taskDueAt: r.task_due, inviterName: r.inviter_name || r.invited_by })),
    // taskId → {remind, ownerName}（我已接受的协作任务），供来源标记与提醒过滤
    myAcceptedMap() {
      const rows = db.prepare(`SELECT c.task_id, c.remind, u.name AS owner_name FROM task_collaborators c LEFT JOIN users u ON u.id = c.owner_id WHERE c.user_id = ? AND c.status = 'accepted'`).all(userId)
      const m = new Map()
      for (const r of rows) m.set(r.task_id, { remind: !!r.remind, from: r.owner_name || '' })
      return m
    },
    get: (id) => toCollab(db.prepare(`SELECT * FROM task_collaborators WHERE id = ?`).get(id)),
    // 邀请（owner 调用）：已有 pending/accepted → 原样返回；24h 内被拒 → null（冷却）；更早被拒/已退出 → 重新置为 pending。
    invite(taskId, targetUserId) {
      const task = db.prepare(`SELECT * FROM tasks WHERE id = ? AND user_id = ?`).get(taskId, userId)
      if (!task || targetUserId === userId) return null
      const existing = db.prepare(`SELECT * FROM task_collaborators WHERE task_id = ? AND user_id = ?`).get(taskId, targetUserId)
      if (existing) {
        if (existing.status === 'pending' || existing.status === 'accepted') return { collab: toCollab(existing), reused: true }
        if (existing.status === 'declined' && existing.responded_at && Date.now() - new Date(existing.responded_at).getTime() < 24 * 3600000) return null
        db.prepare(`UPDATE task_collaborators SET status = 'pending', invited_by = ?, created_at = ?, responded_at = NULL WHERE id = ?`).run(userId, nowIso(), existing.id)
        return { collab: this.get(existing.id), reused: false }
      }
      const id = makeId('clb')
      db.prepare(`INSERT INTO task_collaborators (id,task_id,owner_id,user_id,invited_by,status,remind,created_at) VALUES (?,?,?,?,?,'pending',1,?)`)
        .run(id, taskId, userId, targetUserId, userId, nowIso())
      return { collab: this.get(id), reused: false }
    },
    // 响应（被邀请人调用）。decision: 'accepted' | 'declined' | 'following'
    respond(id, decision, remind = true) {
      const row = db.prepare(`SELECT * FROM task_collaborators WHERE id = ? AND user_id = ? AND status = 'pending'`).get(id, userId)
      if (!row) return null
      const d = decision === true ? 'accepted' : decision === false ? 'declined' : decision
      if (!['accepted', 'declined', 'following'].includes(d)) return null
      db.prepare(`UPDATE task_collaborators SET status = ?, remind = ?, responded_at = ? WHERE id = ?`)
        .run(d, remind ? 1 : 0, nowIso(), id)
      return this.get(id)
    },
    leave(taskId) {
      const r = db.prepare(`UPDATE task_collaborators SET status = 'left', responded_at = ? WHERE task_id = ? AND user_id = ? AND status IN ('accepted','following')`).run(nowIso(), taskId, userId)
      return r.changes > 0
    },
    acceptedUsersOf: (taskId) => db.prepare(`SELECT user_id FROM task_collaborators WHERE task_id = ? AND status IN ('accepted','pending','following')`).all(taskId).map((r) => r.user_id),
    // 进展通知接收者：owner + 已接受/仅关注（调用方自行排除操作者）
    watchersOf(taskId) {
      const t = db.prepare(`SELECT user_id FROM tasks WHERE id = ?`).get(taskId)
      const cs = db.prepare(`SELECT user_id FROM task_collaborators WHERE task_id = ? AND status IN ('accepted','following')`).all(taskId).map((r) => r.user_id)
      return t ? [t.user_id, ...cs] : cs
    },
    removeForTask: (taskId) => db.prepare(`DELETE FROM task_collaborators WHERE task_id = ?`).run(taskId),
  }

  // 自动化规则（当前动作：invite）
  const autoRules = {
    all: () => db.prepare(`SELECT * FROM auto_rules WHERE user_id = ? ORDER BY created_at DESC`).all(userId)
      .map((r) => ({ id: r.id, keyword: r.keyword, action: r.action, targetId: r.target_id, targetName: r.target_name, createdAt: r.created_at })),
    create(keyword, targetId, targetName) {
      const id = makeId('rule')
      db.prepare(`INSERT INTO auto_rules (id,user_id,keyword,action,target_id,target_name,created_at) VALUES (?,?,?,'invite',?,?,?)`)
        .run(id, userId, keyword, targetId, targetName || '', nowIso())
      return this.all().find((r) => r.id === id)
    },
    remove: (id) => db.prepare(`DELETE FROM auto_rules WHERE id = ? AND user_id = ?`).run(id, userId),
  }
  const notifications = {
    all: () => db.prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC`).all(userId).map(toNotif),
    create(data) { const id = data.id || makeId('nt'); db.prepare(`INSERT INTO notifications (id,user_id,type,icon,color,text,read,action_type,action_ref,handled,created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?)`).run(id, userId, data.type || null, data.icon || null, data.color || null, data.text, data.read ? 1 : 0, data.actionType || null, data.actionRef || null, data.createdAt || nowIso()); return toNotif(db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(id)) },
    markAllRead: () => db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ?`).run(userId),
    markRead: (id) => db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`).run(id, userId),
    // 可操作通知：处理后按钮置灰（按 action_ref 消费，跨用户场景用原始 db 写入方调用）
    markHandledByRef: (ref) => db.prepare(`UPDATE notifications SET handled = 1, read = 1 WHERE user_id = ? AND action_ref = ?`).run(userId, ref),
    // dedupe helper: has this exact notification already been generated today?
    // 与 created_at 同源用 nowIso()（本地时区格式），避免 UTC/本地跨日错配导致重复生成。
    existsToday: (text) => !!db.prepare(`SELECT 1 FROM notifications WHERE user_id = ? AND text = ? AND substr(created_at,1,10) = ? LIMIT 1`)
      .get(userId, text, nowIso().slice(0, 10)),
  }

  return { projects, tasks, ideas, nonTodos, agent, settings, captureRecords, corrections, aiErrors, chat, aiConfig, subtasks, comments, activity, notifications, collaborators, autoRules }
}
