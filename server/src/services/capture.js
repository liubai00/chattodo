import { triageInput, triageInputSync } from './triage/index.js'

// Persist a triage result: create the routed entity + a generation record.
// Shared by /api/capture and the rule-based chat path.
export function persistCapture(repos, { result, text, source = 'web' }) {
  let entityType
  let entity
  if (result.kind === 'task') {
    entityType = 'task'
    entity = repos.tasks.create({
      title: result.title, notes: '', status: 'todo', projectId: null,
      tags: result.tags || [], context: result.context || '',
      dueAt: result.dueAt || null, plannedAt: result.plannedAt || null,
      durationMinutes: result.durationMinutes || 30, priority: result.priority || 3,
      privacyScope: result.privacyScope, sourceIdeaId: null,
    })
  } else if (result.kind === 'todo_idea') {
    entityType = 'todo_idea'
    entity = repos.ideas.create({
      title: result.title, rawText: text, status: 'clarifying',
      suggestedNextAction: result.suggestedNextAction, aiReason: result.reason,
      privacyScope: result.privacyScope, source,
    })
  } else {
    entityType = 'non_todo'
    entity = repos.nonTodos.create({
      title: result.title, summary: result.summary, rawText: text, reason: result.reason,
      suggestedDestination: result.suggestedDestination, privacyScope: result.privacyScope, source,
    })
  }

  repos.captureRecords.create({
    rawInput: text, source, aiKind: result.kind, confidence: result.confidence,
    aiReason: result.reason, resultEntityType: entityType, resultEntityId: entity.id, status: 'ok',
  })
  if (entityType === 'task') repos.activity.log(entity.id, '任务已创建（来自聊天输入）')
  return { result, entityType, entity }
}

// Triage raw input via the configured provider (LLM or rule), then persist.
// On LLM failure: log the error and fall back to the rule engine (unless disabled).
export async function capture(repos, { text, source = 'web' }) {
  const aiConfig = repos.aiConfig?.get?.() || null
  let result
  try {
    result = await triageInput(text, { aiConfig })
  } catch (err) {
    repos.aiErrors.create({ rawInput: text, message: err.message })
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
