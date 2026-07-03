import { triageInput, triageInputSync } from './triage/index.js'

// 项目归属：输入文本里出现项目名 → 自动挂到该项目（大小写不敏感）。
export async function matchProjectId(repos, text) {
  const t = String(text || '').toLowerCase()
  if (!t) return null
  const hit = (await repos.projects.all()).find((p) => p.name && p.name.length >= 2 && t.includes(p.name.toLowerCase()))
  return hit ? hit.id : null
}

// Persist a triage result: create the routed entity + a generation record.
// Shared by /api/capture and the rule-based chat path.
export async function persistCapture(repos, { result, text, source = 'web' }) {
  let entityType
  let entity
  if (result.kind === 'task') {
    entityType = 'task'
    entity = await repos.tasks.create({
      title: result.title, notes: '', status: 'todo', projectId: await matchProjectId(repos, text),
      tags: result.tags || [], context: result.context || '',
      dueAt: result.dueAt || null, plannedAt: result.plannedAt || null,
      durationMinutes: result.durationMinutes || 30, priority: result.priority || 3,
      privacyScope: result.privacyScope, sourceIdeaId: null,
    })
  } else if (result.kind === 'todo_idea') {
    entityType = 'todo_idea'
    entity = await repos.ideas.create({
      title: result.title, rawText: text, status: 'clarifying',
      suggestedNextAction: result.suggestedNextAction, aiReason: result.reason,
      privacyScope: result.privacyScope, source,
    })
  } else {
    entityType = 'non_todo'
    entity = await repos.nonTodos.create({
      title: result.title, summary: result.summary, rawText: text, reason: result.reason,
      suggestedDestination: result.suggestedDestination, privacyScope: result.privacyScope, source,
    })
  }

  await repos.captureRecords.create({
    rawInput: text, source, aiKind: result.kind, confidence: result.confidence,
    aiReason: result.reason, resultEntityType: entityType, resultEntityId: entity.id, status: 'ok',
  })
  if (entityType === 'task') await repos.activity.log(entity.id, '任务已创建（来自聊天输入）')
  return { result, entityType, entity }
}

// Triage raw input via the configured provider (LLM or rule), then persist.
// On LLM failure: log the error and fall back to the rule engine (unless disabled).
export async function capture(repos, { text, source = 'web' }) {
  const aiConfig = await (repos.aiConfig?.get?.() || null)
  let result
  try {
    result = await triageInput(text, { aiConfig })
  } catch (err) {
    await repos.aiErrors.create({ rawInput: text, message: err.message })
    if (!aiConfig || aiConfig.fallbackToRule !== false) {
      result = triageInputSync(text)
    } else {
      const e = new Error('AI triage 失败：' + err.message)
      e.statusCode = 502
      e.aiFailure = true
      throw e
    }
  }
  return persistCapture(repos, { result, text, source })
}
