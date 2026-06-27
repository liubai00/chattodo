// Rule-based triage — first-version stand-in for the LLM provider.
// Mirrors the AiProvider.triageInput contract from the brief: every input is
// classified into one of three kinds (task / todo_idea / non_todo).

const ACTION_VERBS = [
  '做', '写', '发', '发送', '提交', '整理', '研究', '联系', '确认', '预约',
  '完成', '准备', '安排', '回复', '修改', '检查', 'review', '更新', '部署',
  '调研', '对接', '跟进', '催', '报销', '打电话', '买', '订',
]

const VAGUE_MARKERS = [
  '研究一下', '看看', '了解一下', '想想', '考虑', '探索', '调研一下',
  '有空', '抽空', '回头', '改天', '或许', '也许', '可能要',
]

const NON_TODO_MARKERS = [
  '可以借鉴', '是个好主意', '感觉', '觉得', '想法是', '灵感', '摘录',
  '参考', '观点', '其实', '本质上', '有意思', '不错的点子', '值得记录',
]

const TIME_HINTS = [
  ['今天', 0], ['今晚', 0], ['明天', 1], ['后天', 2],
  ['下周', 7], ['周一', null], ['周二', null], ['周三', null],
  ['周四', null], ['周五', null], ['周末', null], ['月底', null], ['本周', null],
]

const PERSONAL_MARKERS = ['家', '家里', '孩子', '老婆', '老公', '父母', '健身', '医院', '看病', '私人', '生日', '约会']
const WORK_MARKERS = ['评审', 'prd', 'mvp', '文档', '需求', '项目', '客户', '老板', '同事', '会议', '上线', '接口', 'api', '代码']

function pad(n) {
  return String(n).padStart(2, '0')
}

function isoDaysFromNow(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(18, 0, 0, 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00:00`
}

function detectDue(text) {
  for (const [hint, days] of TIME_HINTS) {
    if (text.includes(hint) && days !== null) {
      return isoDaysFromNow(days)
    }
  }
  // Day-of-week hints → nearest upcoming weekday.
  const weekMap = { 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6, 周日: 0, 周末: 6 }
  for (const key of Object.keys(weekMap)) {
    if (text.includes(key)) {
      const target = weekMap[key]
      const now = new Date()
      let delta = (target - now.getDay() + 7) % 7
      if (delta === 0) delta = 7
      return isoDaysFromNow(delta)
    }
  }
  return null
}

function detectScope(text) {
  const t = text.toLowerCase()
  const personal = PERSONAL_MARKERS.some((m) => text.includes(m))
  const work = WORK_MARKERS.some((m) => t.includes(m))
  if (personal && !work) return 'personal'
  if (work && !personal) return 'work'
  if (personal && work) return 'mixed'
  return 'work'
}

function makeTitle(text) {
  const cleaned = text.trim().replace(/\s+/g, ' ')
  if (cleaned.length <= 24) return cleaned
  return cleaned.slice(0, 22) + '…'
}

function detectPriority(text, due) {
  if (text.includes('紧急') || text.includes('马上') || text.includes('立刻')) return 1
  if (due) {
    const ms = new Date(due).getTime() - Date.now()
    const days = ms / (1000 * 60 * 60 * 24)
    if (days <= 2) return 1
    if (days <= 5) return 2
  }
  return 3
}

function detectTags(text) {
  const tags = []
  const t = text.toLowerCase()
  if (WORK_MARKERS.some((m) => t.includes(m))) tags.push('工作')
  if (PERSONAL_MARKERS.some((m) => text.includes(m))) tags.push('个人')
  if (text.includes('文档') || text.includes('prd') || t.includes('doc')) tags.push('文档')
  if (text.includes('研究') || text.includes('调研')) tags.push('调研')
  return tags
}

// Returns a TriageResult-shaped object.
export function triageInput(text) {
  const trimmed = text.trim()
  const due = detectDue(trimmed)
  const scope = detectScope(trimmed)

  const hasAction = ACTION_VERBS.some((v) => trimmed.toLowerCase().includes(v.toLowerCase()))
  const isVague = VAGUE_MARKERS.some((m) => trimmed.includes(m))
  const isNonTodo = NON_TODO_MARKERS.some((m) => trimmed.includes(m))

  // Non-todo: pure opinion / inspiration / reference, no action commitment.
  if (isNonTodo && !due && !(hasAction && !isVague)) {
    return {
      kind: 'non_todo',
      title: makeTitle(trimmed),
      summary: trimmed.length > 60 ? trimmed.slice(0, 58) + '…' : trimmed,
      reason: '更像产品想法或参考信息，缺少明确行动承诺。',
      suggestedDestination: 'archive',
      confidence: 0.74,
      privacyScope: scope,
    }
  }

  // Clear todo: has an action verb AND (a deadline OR is not vague).
  if (hasAction && (due || !isVague)) {
    return {
      kind: 'task',
      title: makeTitle(trimmed),
      reason: due
        ? '包含明确行动与时间约束，判定为可执行任务。'
        : '包含明确行动动词与交付意图，判定为可执行任务。',
      confidence: due ? 0.92 : 0.81,
      dueAt: due,
      plannedAt: null,
      durationMinutes: null,
      priority: detectPriority(trimmed, due),
      privacyScope: scope,
      tags: detectTags(trimmed),
      context: scope === 'work' ? '电脑前' : '任意',
    }
  }

  // Vague todo: has intent but lacks goal / next step / done-criteria.
  if (hasAction || isVague) {
    return {
      kind: 'todo_idea',
      title: makeTitle(trimmed),
      reason: '有行动倾向，但缺少明确目标、下一步或完成标准。',
      suggestedNextAction: '明确研究目标、输出形式与完成标准。',
      confidence: 0.66,
      privacyScope: scope,
    }
  }

  // Default: treat as non-todo reference material.
  return {
    kind: 'non_todo',
    title: makeTitle(trimmed),
    summary: trimmed.length > 60 ? trimmed.slice(0, 58) + '…' : trimmed,
    reason: '没有识别到明确行动承诺，作为参考信息隔离输出。',
    suggestedDestination: 'archive',
    confidence: 0.6,
    privacyScope: scope,
  }
}

// Simple intent detection for the chat dock: plan question vs capture.
export function detectIntent(message) {
  const m = message.trim()
  const planMarkers = ['做什么', '接下来', '计划', '安排什么', '该干嘛', '下一步做', '两小时']
  if (planMarkers.some((k) => m.includes(k)) && m.includes('?') === false && m.length < 40) {
    if (planMarkers.some((k) => m.includes(k))) return 'plan'
  }
  if (planMarkers.some((k) => m.includes(k))) return 'plan'
  return 'capture'
}
