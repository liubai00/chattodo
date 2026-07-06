import { makeId, nowIso, nowIsoMs } from '../lib/ids.js'
import { config } from '../config.js'

// ---- row -> domain mappers (snake_case -> camelCase, matching the frontend shape) ----
// 类型在 PG 里保持与 SQLite 一致（TEXT 存 JSON、INTEGER 存 0/1），映射层无需改动。
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
    aiVisibility: r.ai_visibility, notifPrefs, theme: r.theme || 'light', friendPolicy: r.friend_policy === 'closed' ? 'closed' : 'open', updatedAt: r.updated_at,
  }
}
const toChat = (r) => r && { id: r.id, role: r.role, text: r.text, isError: !!r.is_error, conversationId: r.conversation_id || '', createdAt: r.created_at }
const toConv = (r) => r && { id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at, lastText: r.last_text || '', messageCount: Number(r.msg_count || 0) }
const toRecord = (r) => r && {
  id: r.id, rawInput: r.raw_input, source: r.source, aiKind: r.ai_kind, confidence: r.confidence,
  aiReason: r.ai_reason, resultEntityType: r.result_entity_type, resultEntityId: r.result_entity_id,
  status: r.status, createdAt: r.created_at,
}
const toAiConfig = (r) => r && {
  provider: r.provider, baseUrl: r.base_url, model: r.model, apiKey: r.api_key,
  fallbackToRule: !!r.fallback_to_rule, updatedAt: r.updated_at,
}
const toSub = (r) => r && { id: r.id, text: r.text, done: !!r.done, createdAt: r.created_at }
const toComment = (r) => r && { id: r.id, author: r.author, text: r.text, createdAt: r.created_at }
const toAct = (r) => r && { id: r.id, text: r.text, createdAt: r.created_at }
const toNotif = (r) => r && { id: r.id, type: r.type, icon: r.icon, color: r.color, text: r.text, read: !!r.read, actionType: r.action_type || null, actionRef: r.action_ref || null, handled: !!r.handled, createdAt: r.created_at }
const toCollab = (r) => r && { id: r.id, taskId: r.task_id, ownerId: r.owner_id, userId: r.user_id, invitedBy: r.invited_by, status: r.status, remind: !!r.remind, createdAt: r.created_at, respondedAt: r.responded_at }

// generic dynamic UPDATE builder (async)
async function applyUpdate(db, table, id, userId, patch, fieldMap, serialize = (k, v) => v) {
  const sets = []
  const vals = []
  for (const [k, col] of Object.entries(fieldMap)) {
    if (k in patch) { sets.push(`${col} = ?`); vals.push(serialize(k, patch[k])) }
  }
  sets.push('updated_at = ?'); vals.push(nowIso())
  vals.push(id, userId)
  await db.run(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, vals)
}

const TASK_FIELDS = {
  title: 'title', notes: 'notes', status: 'status', projectId: 'project_id', tags: 'tags',
  context: 'context', dueAt: 'due_at', plannedAt: 'planned_at', durationMinutes: 'duration_minutes',
  priority: 'priority', privacyScope: 'privacy_scope', sourceIdeaId: 'source_idea_id', assignee: 'assignee',
}
const serTask = (k, v) => (k === 'tags' ? JSON.stringify(v ?? []) : v)

// db 是异步驱动（driver.js）：get/all/run/tx。makeRepos 返回的所有方法均为 async。
export function makeRepos(db, userId = config.defaultUserId) {
  const projects = {
    all: async () => (await db.all(`SELECT * FROM projects WHERE user_id = ? ORDER BY created_at`, [userId])).map(toProject),
    get: async (id) => toProject(await db.get(`SELECT * FROM projects WHERE id = ? AND user_id = ?`, [id, userId])),
    async create(data) {
      const id = data.id || makeId('proj')
      const ts = nowIso()
      await db.run(`INSERT INTO projects (id,user_id,name,description,status,privacy_scope,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
        [id, userId, data.name, data.description ?? '', data.status ?? 'active', data.privacyScope ?? 'work', ts, ts])
      return this.get(id)
    },
  }

  // 任务访问级别：owner（自己的）| collaborator（已接受协作）| null（无权）。
  const taskAccess = async (taskId) => {
    const row = await db.get(`SELECT user_id FROM tasks WHERE id = ?`, [taskId])
    if (!row) return null
    if (row.user_id === userId) return 'owner'
    const c = await db.get(`SELECT 1 AS ok FROM task_collaborators WHERE task_id = ? AND user_id = ? AND status = 'accepted'`, [taskId, userId])
    return c ? 'collaborator' : null
  }

  const tasks = {
    all: async () => (await db.all(`SELECT * FROM tasks WHERE user_id = ? OR id IN (SELECT task_id FROM task_collaborators WHERE user_id = ? AND status = 'accepted') ORDER BY created_at DESC`, [userId, userId])).map(toTask),
    async get(id) {
      const access = await taskAccess(id)
      if (!access) return undefined
      return toTask(await db.get(`SELECT * FROM tasks WHERE id = ?`, [id]))
    },
    access: taskAccess,
    async create(data) {
      const id = data.id || makeId('task')
      const ts = nowIso()
      await db.run(`INSERT INTO tasks (id,user_id,title,notes,status,project_id,tags,context,due_at,planned_at,duration_minutes,priority,privacy_scope,source_idea_id,created_at,updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, userId, data.title, data.notes ?? '', data.status ?? 'todo', data.projectId ?? null,
          JSON.stringify(data.tags ?? []), data.context ?? '', data.dueAt ?? null, data.plannedAt ?? null,
          data.durationMinutes ?? null, data.priority ?? 3, data.privacyScope ?? 'work', data.sourceIdeaId ?? null, ts, ts])
      return this.get(id)
    },
    // owner 全字段可改；协作者只允许改状态（完成/进行中）。
    async update(id, patch) {
      const access = await taskAccess(id)
      if (!access) return undefined
      if (access === 'owner') { await applyUpdate(db, 'tasks', id, userId, patch, TASK_FIELDS, serTask); return this.get(id) }
      if ('status' in patch) await db.run(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`, [patch.status, nowIso(), id])
      return this.get(id)
    },
    remove: (id) => db.run(`DELETE FROM tasks WHERE id = ? AND user_id = ?`, [id, userId]), // owner only
  }

  const ideas = {
    all: async () => (await db.all(`SELECT * FROM todo_ideas WHERE user_id = ? ORDER BY created_at DESC`, [userId])).map(toIdea),
    get: async (id) => toIdea(await db.get(`SELECT * FROM todo_ideas WHERE id = ? AND user_id = ?`, [id, userId])),
    async create(data) {
      const id = data.id || makeId('idea')
      const ts = nowIso()
      await db.run(`INSERT INTO todo_ideas (id,user_id,title,raw_text,status,suggested_next_action,ai_reason,privacy_scope,source,created_at,updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id, userId, data.title, data.rawText ?? '', data.status ?? 'clarifying', data.suggestedNextAction ?? '',
          data.aiReason ?? '', data.privacyScope ?? 'work', data.source ?? 'chat', ts, ts])
      return this.get(id)
    },
    async update(id, patch) {
      await applyUpdate(db, 'todo_ideas', id, userId, patch, { title: 'title', status: 'status', suggestedNextAction: 'suggested_next_action', aiReason: 'ai_reason', privacyScope: 'privacy_scope' })
      return this.get(id)
    },
    remove: (id) => db.run(`DELETE FROM todo_ideas WHERE id = ? AND user_id = ?`, [id, userId]),
  }

  const nonTodos = {
    all: async () => (await db.all(`SELECT * FROM non_todo_outputs WHERE user_id = ? ORDER BY created_at DESC`, [userId])).map(toNon),
    get: async (id) => toNon(await db.get(`SELECT * FROM non_todo_outputs WHERE id = ? AND user_id = ?`, [id, userId])),
    async create(data) {
      const id = data.id || makeId('non')
      const ts = nowIso()
      await db.run(`INSERT INTO non_todo_outputs (id,user_id,title,summary,raw_text,reason,suggested_destination,privacy_scope,source,corrected,created_at,updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, userId, data.title, data.summary ?? '', data.rawText ?? '', data.reason ?? '',
          data.suggestedDestination ?? 'archive', data.privacyScope ?? 'work', data.source ?? 'chat', data.corrected ? 1 : 0, ts, ts])
      return this.get(id)
    },
    remove: (id) => db.run(`DELETE FROM non_todo_outputs WHERE id = ? AND user_id = ?`, [id, userId]),
  }

  const agent = {
    get: async () => toAgent(await db.get(`SELECT * FROM agent_profile WHERE user_id = ?`, [userId])),
    async update(patch) {
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
      await db.run(`UPDATE agent_profile SET ${sets.join(', ')} WHERE user_id = ?`, vals)
      return this.get()
    },
  }

  const settings = {
    get: async () => toSettings(await db.get(`SELECT * FROM app_settings WHERE user_id = ?`, [userId])),
    async update(patch) {
      const map = { workspaceMode: 'workspace_mode', privacyMode: 'privacy_mode', defaultView: 'default_view', aiVisibility: 'ai_visibility', notifPrefs: 'notif_prefs', theme: 'theme', friendPolicy: 'friend_policy' }
      const sets = []; const vals = []
      for (const [k, col] of Object.entries(map)) {
        if (k in patch) {
          const v = k === 'privacyMode' ? (patch[k] ? 1 : 0)
            : k === 'notifPrefs' ? JSON.stringify(patch[k] || {})
              : k === 'friendPolicy' ? (patch[k] === 'closed' ? 'closed' : 'open') // 白名单，非法值回退 open
                : patch[k]
          sets.push(`${col} = ?`); vals.push(v)
        }
      }
      sets.push('updated_at = ?'); vals.push(nowIso())
      vals.push(userId)
      await db.run(`UPDATE app_settings SET ${sets.join(', ')} WHERE user_id = ?`, vals)
      return this.get()
    },
  }

  const captureRecords = {
    async create(data) {
      const id = data.id || makeId('rec')
      await db.run(`INSERT INTO capture_records (id,user_id,raw_input,source,ai_kind,confidence,ai_reason,result_entity_type,result_entity_id,status,created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id, userId, data.rawInput, data.source ?? 'chat', data.aiKind, data.confidence ?? null, data.aiReason ?? '',
          data.resultEntityType ?? null, data.resultEntityId ?? null, data.status ?? 'ok', nowIso()])
      return toRecord(await db.get(`SELECT * FROM capture_records WHERE id = ?`, [id]))
    },
    getByEntity: async (type, id) => toRecord(await db.get(`SELECT * FROM capture_records WHERE user_id = ? AND result_entity_type = ? AND result_entity_id = ? ORDER BY created_at DESC LIMIT 1`, [userId, type, id])),
    relink: (oldEntityId, newType, newId) =>
      db.run(`UPDATE capture_records SET result_entity_type = ?, result_entity_id = ? WHERE user_id = ? AND result_entity_id = ?`, [newType, newId, userId, oldEntityId]),
    all: async () => (await db.all(`SELECT * FROM capture_records WHERE user_id = ? ORDER BY created_at DESC`, [userId])).map(toRecord),
  }

  const corrections = {
    async create(data) {
      const id = data.id || makeId('corr')
      await db.run(`INSERT INTO corrections (id,user_id,entity_type,entity_id,from_kind,to_kind,note,created_at) VALUES (?,?,?,?,?,?,?,?)`,
        [id, userId, data.entityType, data.entityId, data.fromKind ?? null, data.toKind ?? null, data.note ?? '', nowIso()])
      return id
    },
    all: () => db.all(`SELECT * FROM corrections WHERE user_id = ? ORDER BY created_at DESC`, [userId]),
  }

  const aiErrors = {
    async create(data) {
      const id = data.id || makeId('err')
      await db.run(`INSERT INTO ai_errors (id,user_id,raw_input,message,created_at) VALUES (?,?,?,?,?)`,
        [id, userId, data.rawInput ?? '', data.message ?? '', nowIso()])
      return id
    },
    all: () => db.all(`SELECT * FROM ai_errors WHERE user_id = ? ORDER BY created_at DESC`, [userId]),
  }

  const defaultConvId = 'conv_' + userId
  const chat = {
    // conversationId 省略时回退到用户默认会话（保持旧调用点可用）
    all: async (conversationId) => (await db.all(
      `SELECT * FROM chat_messages WHERE user_id = ? AND conversation_id = ? ORDER BY created_at`,
      [userId, conversationId || defaultConvId])).map(toChat),
    async create(data) {
      const id = data.id || makeId('msg')
      const convId = data.conversationId || defaultConvId
      await db.run(`INSERT INTO chat_messages (id,user_id,conversation_id,role,text,is_error,created_at) VALUES (?,?,?,?,?,?,?)`,
        [id, userId, convId, data.role, data.text, data.isError ? 1 : 0, nowIso()])
      await db.run(`UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?`, [nowIsoMs(), convId, userId])
      return toChat(await db.get(`SELECT * FROM chat_messages WHERE id = ?`, [id]))
    },
  }

  const conversations = {
    list: async () => (await db.all(
      `SELECT c.*,
              (SELECT text FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_text,
              (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS msg_count
         FROM conversations c WHERE c.user_id = ? ORDER BY c.updated_at DESC`, [userId])).map(toConv),
    get: async (id) => toConv(await db.get(`SELECT * FROM conversations WHERE id = ? AND user_id = ?`, [id, userId])),
    latestId: async () => { const r = await db.get(`SELECT id FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`, [userId]); return r ? r.id : null },
    async ensureDefault() {
      const ex = await db.get(`SELECT id FROM conversations WHERE id = ?`, [defaultConvId])
      if (!ex) { const ts = nowIsoMs(); await db.run(`INSERT INTO conversations (id,user_id,title,created_at,updated_at) VALUES (?,?,?,?,?)`, [defaultConvId, userId, '默认对话', ts, ts]) }
      return defaultConvId
    },
    async create(title) {
      const id = makeId('conv'); const ts = nowIsoMs()
      await db.run(`INSERT INTO conversations (id,user_id,title,created_at,updated_at) VALUES (?,?,?,?,?)`, [id, userId, String(title || '新对话').slice(0, 40), ts, ts])
      return toConv(await db.get(`SELECT * FROM conversations WHERE id = ?`, [id]))
    },
    async rename(id, title) {
      await db.run(`UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?`, [String(title || '').slice(0, 40), nowIsoMs(), id, userId])
      return this.get(id)
    },
    // 首条消息自动命名（仅当标题仍是默认占位时）+ 置顶
    async touch(id, maybeTitle) {
      if (maybeTitle) await db.run(`UPDATE conversations SET updated_at = ?, title = CASE WHEN title IN ('新对话','默认对话') THEN ? ELSE title END WHERE id = ? AND user_id = ?`, [nowIsoMs(), String(maybeTitle).replace(/\s+/g, ' ').trim().slice(0, 24) || '新对话', id, userId])
      else await db.run(`UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?`, [nowIsoMs(), id, userId])
    },
    async remove(id) {
      await db.tx(async (t) => {
        await t.run(`DELETE FROM chat_messages WHERE conversation_id = ? AND user_id = ?`, [id, userId])
        await t.run(`DELETE FROM conversations WHERE id = ? AND user_id = ?`, [id, userId])
      })
    },
  }

  const AI_DEFAULTS = { provider: 'rule', baseUrl: '', model: '', apiKey: '', fallbackToRule: true, updatedAt: null }
  const aiWrite = async (rowId, patch) => {
    await db.run(`INSERT INTO ai_config (id, updated_at) VALUES (?, ?) ON CONFLICT (id) DO NOTHING`, [rowId, nowIso()])
    const map = { provider: 'provider', baseUrl: 'base_url', model: 'model', apiKey: 'api_key', fallbackToRule: 'fallback_to_rule' }
    const sets = []; const vals = []
    for (const [k, col] of Object.entries(map)) {
      if (k in patch) { sets.push(`${col} = ?`); vals.push(k === 'fallbackToRule' ? (patch[k] ? 1 : 0) : patch[k]) }
    }
    sets.push('updated_at = ?'); vals.push(nowIso())
    vals.push(rowId)
    await db.run(`UPDATE ai_config SET ${sets.join(', ')} WHERE id = ?`, vals)
  }
  const aiConfig = {
    getTeam: async () => toAiConfig(await db.get(`SELECT * FROM ai_config WHERE id = 'default'`)) || { ...AI_DEFAULTS },
    getOwn: async () => toAiConfig(await db.get(`SELECT * FROM ai_config WHERE id = ?`, ['u:' + userId])),
    async get() { return (await this.getOwn()) || this.getTeam() },
    async update(patch) { await aiWrite('default', patch); return this.getTeam() },
    async updateOwn(patch) { await aiWrite('u:' + userId, patch); return this.getOwn() },
    clearOwn: () => db.run(`DELETE FROM ai_config WHERE id = ?`, ['u:' + userId]),
  }

  // 子任务/评论/活动属于任务本身：有任务访问权即可读写，作者身份仍记在行上。
  const subtasks = {
    byTask: async (taskId) => (await taskAccess(taskId)) ? (await db.all(`SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at`, [taskId])).map(toSub) : [],
    async create(taskId, text) {
      if (!(await taskAccess(taskId))) return null
      const id = makeId('sub')
      await db.run(`INSERT INTO subtasks (id,user_id,task_id,text,done,created_at) VALUES (?,?,?,?,0,?)`, [id, userId, taskId, text, nowIso()])
      return toSub(await db.get(`SELECT * FROM subtasks WHERE id = ?`, [id]))
    },
    async toggle(id) {
      const r = await db.get(`SELECT task_id, done FROM subtasks WHERE id = ?`, [id])
      if (!r || !(await taskAccess(r.task_id))) return null
      await db.run(`UPDATE subtasks SET done = ? WHERE id = ?`, [r.done ? 0 : 1, id])
      return toSub(await db.get(`SELECT * FROM subtasks WHERE id = ?`, [id]))
    },
    async remove(id) {
      const r = await db.get(`SELECT task_id FROM subtasks WHERE id = ?`, [id])
      if (r && (await taskAccess(r.task_id))) await db.run(`DELETE FROM subtasks WHERE id = ?`, [id])
    },
  }
  const comments = {
    byTask: async (taskId) => (await taskAccess(taskId)) ? (await db.all(`SELECT * FROM comments WHERE task_id = ? ORDER BY created_at`, [taskId])).map(toComment) : [],
    async create(taskId, author, text) {
      if (!(await taskAccess(taskId))) return null
      const id = makeId('cmt')
      await db.run(`INSERT INTO comments (id,user_id,task_id,author,text,created_at) VALUES (?,?,?,?,?,?)`, [id, userId, taskId, author, text, nowIso()])
      return toComment(await db.get(`SELECT * FROM comments WHERE id = ?`, [id]))
    },
  }
  const activity = {
    byTask: async (taskId) => (await taskAccess(taskId)) ? (await db.all(`SELECT * FROM activity WHERE task_id = ? ORDER BY created_at DESC`, [taskId])).map(toAct) : [],
    async log(taskId, text) { const id = makeId('act'); await db.run(`INSERT INTO activity (id,user_id,task_id,text,created_at) VALUES (?,?,?,?,?)`, [id, userId, taskId, text, nowIso()]); return id },
  }

  // 协作关系：邀请-确认制。幂等邀请、拒后 24h 冷却、可随时退出。
  const collaborators = {
    forTask: async (taskId) => (await db.all(`SELECT c.*, u.name AS user_name FROM task_collaborators c LEFT JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.created_at`, [taskId]))
      .map((r) => ({ ...toCollab(r), userName: r.user_name || r.user_id })),
    myPending: async () => (await db.all(`SELECT c.*, t.title AS task_title, t.due_at AS task_due, u.name AS inviter_name
                                 FROM task_collaborators c JOIN tasks t ON t.id = c.task_id LEFT JOIN users u ON u.id = c.invited_by
                                 WHERE c.user_id = ? AND c.status = 'pending' ORDER BY c.created_at DESC`, [userId]))
      .map((r) => ({ ...toCollab(r), taskTitle: r.task_title, taskDueAt: r.task_due, inviterName: r.inviter_name || r.invited_by })),
    async myAcceptedMap() {
      const rows = await db.all(`SELECT c.task_id, c.remind, u.name AS owner_name FROM task_collaborators c LEFT JOIN users u ON u.id = c.owner_id WHERE c.user_id = ? AND c.status = 'accepted'`, [userId])
      const m = new Map()
      for (const r of rows) m.set(r.task_id, { remind: !!r.remind, from: r.owner_name || '' })
      return m
    },
    get: async (id) => toCollab(await db.get(`SELECT * FROM task_collaborators WHERE id = ?`, [id])),
    async invite(taskId, targetUserId) {
      const task = await db.get(`SELECT id FROM tasks WHERE id = ? AND user_id = ?`, [taskId, userId])
      if (!task || targetUserId === userId) return null
      const existing = await db.get(`SELECT * FROM task_collaborators WHERE task_id = ? AND user_id = ?`, [taskId, targetUserId])
      if (existing) {
        if (existing.status === 'pending' || existing.status === 'accepted') return { collab: toCollab(existing), reused: true }
        if (existing.status === 'declined' && existing.responded_at && Date.now() - new Date(existing.responded_at).getTime() < 24 * 3600000) return null
        await db.run(`UPDATE task_collaborators SET status = 'pending', invited_by = ?, created_at = ?, responded_at = NULL WHERE id = ?`, [userId, nowIso(), existing.id])
        return { collab: await this.get(existing.id), reused: false }
      }
      const id = makeId('clb')
      await db.run(`INSERT INTO task_collaborators (id,task_id,owner_id,user_id,invited_by,status,remind,created_at) VALUES (?,?,?,?,?,'pending',1,?)`,
        [id, taskId, userId, targetUserId, userId, nowIso()])
      return { collab: await this.get(id), reused: false }
    },
    async respond(id, decision, remind = true) {
      const row = await db.get(`SELECT id FROM task_collaborators WHERE id = ? AND user_id = ? AND status = 'pending'`, [id, userId])
      if (!row) return null
      const d = decision === true ? 'accepted' : decision === false ? 'declined' : decision
      if (!['accepted', 'declined', 'following'].includes(d)) return null
      await db.run(`UPDATE task_collaborators SET status = ?, remind = ?, responded_at = ? WHERE id = ?`, [d, remind ? 1 : 0, nowIso(), id])
      return this.get(id)
    },
    async leave(taskId) {
      const r = await db.run(`UPDATE task_collaborators SET status = 'left', responded_at = ? WHERE task_id = ? AND user_id = ? AND status IN ('accepted','following')`, [nowIso(), taskId, userId])
      return r.rowCount > 0
    },
    acceptedUsersOf: async (taskId) => (await db.all(`SELECT user_id FROM task_collaborators WHERE task_id = ? AND status IN ('accepted','pending','following')`, [taskId])).map((r) => r.user_id),
    async watchersOf(taskId) {
      const t = await db.get(`SELECT user_id FROM tasks WHERE id = ?`, [taskId])
      const cs = (await db.all(`SELECT user_id FROM task_collaborators WHERE task_id = ? AND status IN ('accepted','following')`, [taskId])).map((r) => r.user_id)
      return t ? [t.user_id, ...cs] : cs
    },
    removeForTask: (taskId) => db.run(`DELETE FROM task_collaborators WHERE task_id = ?`, [taskId]),
  }

  const autoRules = {
    all: async () => (await db.all(`SELECT * FROM auto_rules WHERE user_id = ? ORDER BY created_at DESC`, [userId]))
      .map((r) => ({ id: r.id, keyword: r.keyword, action: r.action, targetId: r.target_id, targetName: r.target_name, createdAt: r.created_at })),
    async create(keyword, targetId, targetName) {
      const id = makeId('rule')
      await db.run(`INSERT INTO auto_rules (id,user_id,keyword,action,target_id,target_name,created_at) VALUES (?,?,?,'invite',?,?,?)`,
        [id, userId, keyword, targetId, targetName || '', nowIso()])
      return (await this.all()).find((r) => r.id === id)
    },
    remove: (id) => db.run(`DELETE FROM auto_rules WHERE id = ? AND user_id = ?`, [id, userId]),
  }

  const notifications = {
    all: async () => (await db.all(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC`, [userId])).map(toNotif),
    async create(data) {
      const id = data.id || makeId('nt')
      await db.run(`INSERT INTO notifications (id,user_id,type,icon,color,text,read,action_type,action_ref,handled,created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?)`,
        [id, userId, data.type || null, data.icon || null, data.color || null, data.text, data.read ? 1 : 0, data.actionType || null, data.actionRef || null, data.createdAt || nowIso()])
      return toNotif(await db.get(`SELECT * FROM notifications WHERE id = ?`, [id]))
    },
    markAllRead: () => db.run(`UPDATE notifications SET read = 1 WHERE user_id = ?`, [userId]),
    markRead: (id) => db.run(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`, [id, userId]),
    markHandledByRef: (ref) => db.run(`UPDATE notifications SET handled = 1, read = 1 WHERE user_id = ? AND action_ref = ?`, [userId, ref]),
    existsToday: async (text) => !!(await db.get(`SELECT 1 AS ok FROM notifications WHERE user_id = ? AND text = ? AND substr(created_at,1,10) = ? LIMIT 1`, [userId, text, nowIso().slice(0, 10)])),
  }

  return { projects, tasks, ideas, nonTodos, agent, settings, captureRecords, corrections, aiErrors, chat, conversations, aiConfig, subtasks, comments, activity, notifications, collaborators, autoRules }
}
