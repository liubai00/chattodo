import { pathToFileURL } from 'node:url'
import { config } from '../config.js'
import { createDb, applySchema } from './index.js'
import { daysFromNow } from '../lib/ids.js'

// Seed data ported verbatim from src/lib/seed.js.
const seedProjects = [
  { id: 'proj_mvp', name: 'AI Todo MVP', description: '两周验证核心闭环', status: 'active', privacyScope: 'work' },
  { id: 'proj_life', name: '个人事务', description: '生活与健康', status: 'active', privacyScope: 'personal' },
]

const seedTasks = [
  { id: 'task_doc', title: '提交 MVP 文档评审', notes: '整理接口清单与验收用例', status: 'todo', projectId: 'proj_mvp', tags: ['工作', '文档'], context: '电脑前', dueAt: daysFromNow(2), plannedAt: null, durationMinutes: 60, priority: 1, privacyScope: 'work', sourceIdeaId: null, createdAt: daysFromNow(-1) },
  { id: 'task_api', title: '整理后端接口清单', notes: '对照 brief 第 9 节', status: 'todo', projectId: 'proj_mvp', tags: ['工作', '调研'], context: '电脑前', dueAt: daysFromNow(1), plannedAt: null, durationMinutes: 30, priority: 2, privacyScope: 'work', sourceIdeaId: null, createdAt: daysFromNow(-1) },
  { id: 'task_review', title: '收集评审反馈并记录', notes: '', status: 'todo', projectId: 'proj_mvp', tags: ['工作'], context: '电脑前', dueAt: daysFromNow(3), plannedAt: null, durationMinutes: 15, priority: 3, privacyScope: 'work', sourceIdeaId: null, createdAt: daysFromNow(-2) },
  { id: 'task_gym', title: '预约本周体检', notes: '', status: 'todo', projectId: 'proj_life', tags: ['个人'], context: '电话', dueAt: daysFromNow(4), plannedAt: null, durationMinutes: 20, priority: 3, privacyScope: 'personal', sourceIdeaId: null, createdAt: daysFromNow(-1) },
  { id: 'task_done', title: '搭建 Web 项目脚手架', notes: '', status: 'done', projectId: 'proj_mvp', tags: ['工作'], context: '电脑前', dueAt: daysFromNow(-1), plannedAt: null, durationMinutes: 45, priority: 2, privacyScope: 'work', sourceIdeaId: null, createdAt: daysFromNow(-3) },
]

const seedTodoIdeas = [
  { id: 'idea_research', title: '研究 Cubox / OmniFocus / Todoist', rawText: '周末研究一下 Cubox、OmniFocus、Todoist', status: 'clarifying', suggestedNextAction: '明确研究目标、输出形式与比较维度。', aiReason: '有行动倾向，但缺少明确目标与完成标准。', privacyScope: 'work', source: 'chat', createdAt: daysFromNow(-1) },
  { id: 'idea_blog', title: '考虑写一篇产品复盘', rawText: '有空想想要不要写篇 AI todo 的产品复盘', status: 'clarifying', suggestedNextAction: '确定读者、核心结论与发布渠道。', aiReason: '只是模糊意向，缺少下一步。', privacyScope: 'mixed', source: 'web', createdAt: daysFromNow(-2) },
]

const seedNonTodos = [
  { id: 'non_cubox', title: 'AI todo 可借鉴 Cubox 稍后读', summary: '产品想法：借鉴 Cubox 的稍后读体验', rawText: 'AI todo app 可以借鉴 Cubox 的稍后读体验', reason: '更像产品想法或参考信息，缺少明确行动承诺。', suggestedDestination: 'archive', privacyScope: 'work', source: 'chat', createdAt: daysFromNow(-1) },
  { id: 'non_quote', title: '关于注意力的摘录', summary: '摘录：好的工具尊重用户的注意力', rawText: '好的工具不是抢占注意力，而是尊重注意力。值得记录。', reason: '只是摘录与观点，没有行动承诺。', suggestedDestination: 'copy', privacyScope: 'mixed', source: 'web', createdAt: daysFromNow(-2) },
]

const seedAgentProfile = {
  soul: '冷静、主动、尊重用户注意力。决策倾向于减少噪音、推动下一步。',
  memory: '用户正在验证 AI 原生 todo app。偏好每天上午处理深度工作。',
  preferences: '输出简洁、行动导向。计划默认按截止时间与优先级排序。',
  workingStyle: 'GTD + 时间块。任务尽量拆到 90 分钟以内。',
  privacyRules: '工作内容默认 work，生活内容默认 personal。隐私模式下不读取另一空间。',
  defaultFollowupStrategy: '任务不清楚时，只问一个最关键的澄清问题。',
  updatedAt: daysFromNow(-1),
}

const seedAppSettings = { workspaceMode: 'work', privacyMode: false, defaultView: 'dashboard', aiVisibility: 'visible_scope_only', updatedAt: daysFromNow(-1) }

const seedChat = [
  { id: 'msg_welcome', role: 'agent', text: '我是你的 todo-first agent。把任何想法丢给我，我会判断它是任务、待澄清想法，还是非 todo 信息。你也可以问我「接下来两小时做什么」。', createdAt: daysFromNow(-1) },
]

// Reset all tables and load seed data. Idempotent (safe to re-run).
export function seedDb(db, userId = config.defaultUserId) {
  const tables = ['projects', 'tasks', 'todo_ideas', 'non_todo_outputs', 'agent_profile', 'app_settings', 'capture_records', 'corrections', 'ai_errors', 'chat_messages', 'ai_config']
  const run = db.transaction(() => {
    for (const t of tables) db.prepare(`DELETE FROM ${t}`).run()

    const insProj = db.prepare(`INSERT INTO projects (id,user_id,name,description,status,privacy_scope,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
    for (const p of seedProjects) insProj.run(p.id, userId, p.name, p.description, p.status, p.privacyScope, daysFromNow(-3), daysFromNow(-3))

    const insTask = db.prepare(`INSERT INTO tasks (id,user_id,title,notes,status,project_id,tags,context,due_at,planned_at,duration_minutes,priority,privacy_scope,source_idea_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (const t of seedTasks) insTask.run(t.id, userId, t.title, t.notes, t.status, t.projectId, JSON.stringify(t.tags || []), t.context, t.dueAt, t.plannedAt, t.durationMinutes, t.priority, t.privacyScope, t.sourceIdeaId, t.createdAt, t.createdAt)

    const insIdea = db.prepare(`INSERT INTO todo_ideas (id,user_id,title,raw_text,status,suggested_next_action,ai_reason,privacy_scope,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    for (const i of seedTodoIdeas) insIdea.run(i.id, userId, i.title, i.rawText, i.status, i.suggestedNextAction, i.aiReason, i.privacyScope, i.source, i.createdAt, i.createdAt)

    const insNon = db.prepare(`INSERT INTO non_todo_outputs (id,user_id,title,summary,raw_text,reason,suggested_destination,privacy_scope,source,corrected,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (const n of seedNonTodos) insNon.run(n.id, userId, n.title, n.summary, n.rawText, n.reason, n.suggestedDestination, n.privacyScope, n.source, 0, n.createdAt, n.createdAt)

    db.prepare(`INSERT INTO agent_profile (user_id,soul,memory,preferences,working_style,privacy_rules,default_followup_strategy,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(userId, seedAgentProfile.soul, seedAgentProfile.memory, seedAgentProfile.preferences, seedAgentProfile.workingStyle, seedAgentProfile.privacyRules, seedAgentProfile.defaultFollowupStrategy, seedAgentProfile.updatedAt)

    db.prepare(`INSERT INTO app_settings (user_id,workspace_mode,privacy_mode,default_view,ai_visibility,updated_at) VALUES (?,?,?,?,?,?)`)
      .run(userId, seedAppSettings.workspaceMode, seedAppSettings.privacyMode ? 1 : 0, seedAppSettings.defaultView, seedAppSettings.aiVisibility, seedAppSettings.updatedAt)

    const insChat = db.prepare(`INSERT INTO chat_messages (id,user_id,role,text,is_error,created_at) VALUES (?,?,?,?,?,?)`)
    for (const m of seedChat) insChat.run(m.id, userId, m.role, m.text, 0, m.createdAt)

    db.prepare(`INSERT INTO ai_config (id,provider,base_url,model,api_key,fallback_to_rule,updated_at) VALUES ('default',?,?,?,?,?,?)`)
      .run(config.ai.provider, config.ai.baseUrl, config.ai.model, config.ai.apiKey, config.ai.fallbackToRule ? 1 : 0, daysFromNow(-1))
  })
  run()
}

// CLI: `npm run seed`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = createDb(config.dbPath)
  applySchema(db)
  seedDb(db)
  console.log(`seeded: ${config.dbPath}`)
  db.close()
}
