// Rule-based triage — the offline AiProvider implementation.
// Ported from src/lib/triage.js. Classifies input into task / todo_idea / non_todo.

const ACTION_VERBS = [
  '做', '写', '发', '发送', '提交', '整理', '研究', '联系', '确认', '预约',
  '完成', '准备', '安排', '回复', '修改', '检查', 'review', '更新', '部署',
  '调研', '对接', '跟进', '催', '报销', '打电话', '买', '订',
  '去', '接', '取', '寄', '见', '开会', '面试', '吃饭', '交',
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

// "八点 / 8点半 / 下午三点" → concrete hour (defaults to 18:00 when absent).
function detectHour(text) {
  const cn = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 }
  const m = String(text).match(/([0-9]{1,2}|十[一二]?|[一两二三四五六七八九])\s*点(半)?/)
  if (!m) return null
  let h = /^[0-9]+$/.test(m[1]) ? parseInt(m[1], 10) : cn[m[1]]
  if (h == null || h > 24) return null
  if (/(晚上|下午|傍晚|晚间|pm)/i.test(text) && h < 12) h += 12
  return { h, min: m[2] ? 30 : 0 }
}

function isoDaysFromNow(days, hm) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const h = hm ? hm.h : 18
  const min = hm ? hm.min : 0
  d.setHours(h, min, 0, 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(min)}:00`
}

export function detectDue(text) {
  const hm = detectHour(text)
  for (const [hint, days] of TIME_HINTS) {
    if (text.includes(hint) && days !== null) return isoDaysFromNow(days, hm)
  }
  const weekMap = { 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6, 周日: 0, 周末: 6 }
  for (const key of Object.keys(weekMap)) {
    if (text.includes(key)) {
      const target = weekMap[key]
      const now = new Date()
      let delta = (target - now.getDay() + 7) % 7
      if (delta === 0) delta = 7
      return isoDaysFromNow(delta, hm)
    }
  }
  return null
}

export function detectScope(text) {
  const t = text.toLowerCase()
  const personal = PERSONAL_MARKERS.some((m) => text.includes(m))
  const work = WORK_MARKERS.some((m) => t.includes(m))
  if (personal && !work) return 'personal'
  if (work && !personal) return 'work'
  if (personal && work) return 'mixed'
  return 'work'
}

export function makeTitle(text) {
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

// Pure classification — returns a TriageResult-shaped object.
export function triageInputSync(text) {
  const trimmed = text.trim()
  const due = detectDue(trimmed)
  const scope = detectScope(trimmed)

  const hasAction = ACTION_VERBS.some((v) => trimmed.toLowerCase().includes(v.toLowerCase()))
  const isVague = VAGUE_MARKERS.some((m) => trimmed.includes(m))
  const isNonTodo = NON_TODO_MARKERS.some((m) => trimmed.includes(m))

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

  // 时间锚定承诺（"明天八点去吃饭"）：带具体钟点、非模糊、非纯参考 → 任务，
  // 即使动词不在词表里。仅日期词（"今天天气不错"）不触发。
  if (due && detectHour(trimmed) && !isVague && !isNonTodo) {
    return {
      kind: 'task',
      title: makeTitle(trimmed),
      reason: '包含明确时间约束，判定为需要执行的安排。',
      confidence: 0.85,
      dueAt: due,
      plannedAt: null,
      durationMinutes: null,
      priority: detectPriority(trimmed, due),
      privacyScope: scope,
      tags: detectTags(trimmed),
      context: scope === 'work' ? '电脑前' : '任意',
    }
  }

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

// Chat intent. Direct commands / questions to the agent must NOT be captured
// as todos: greeting | help | plan | query | complete | delete | question | capture.
const PLAN_MARKERS = ['做什么', '接下来', '安排什么', '该干嘛', '下一步做', '两小时', '怎么安排', '规划一下', '帮我规划', '帮我安排']
const CAPTURE_HINTS = /(记一下|记个|提醒我|帮我记|加个任务|新建任务|加一条|建个任务)/

export function detectIntent(message) {
  const m = String(message || '').trim()
  if (!m) return 'capture'
  if (CAPTURE_HINTS.test(m)) return 'capture'
  // greetings / small talk addressed to the agent
  if (/^(你好|您好|hi|hello|嗨|哈喽|hey|早上好|下午好|晚上好|早安|晚安|在吗|在不在|谢谢|谢啦|辛苦了)[呀啊哦呢!！。?？~～\s]*$/i.test(m)) return 'greeting'
  // capability / usage questions about the assistant itself
  if (m.length <= 24 && /(你是谁|你能做什么|你会什么|你能干什么|能干嘛|会干嘛|怎么用|使用说明|有什么功能|帮助|help)/i.test(m)) return 'help'
  // durable preference → long-term memory ("记住：我习惯上午做深度工作" / "以后都默认 P2")
  if (/^记住[:：，,\s]/.test(m) || /^(以后|下次|每次)(都|请|一律|默认)/.test(m)) return 'remember'
  if (PLAN_MARKERS.some((k) => m.includes(k))) return 'plan'
  // query: look up existing tasks — read-only, never creates anything
  if (/^(有什么|有哪些|哪些|列出|列一下|看看我?|查看|查一下|查询|显示|盘点|汇总|统计)/.test(m) && /(任务|待办|todo|事情|安排|到期|没做|完成)/i.test(m)) return 'query'
  if (/(到期|逾期|过期)/.test(m) && /(哪些|什么|有没有|多少)/.test(m) && m.length <= 30) return 'query'
  if (/^(任务|待办|todo)(列表|清单)?[?？]?$/i.test(m)) return 'query'
  // complete command: "把X标记完成 / X做完了 / 完成：X"
  if (/^(?:帮我)?(?:把)?(.{1,50}?)(?:标记为?完成|置为完成|标记完成|完成掉|搞定了|做完了|已完成|完成了)[。!！~～]*$/.test(m) || /^完成(?:任务)?[:：]/.test(m)) return 'complete'
  // delete command (suffix "把X删掉" or verb-first "删除X" — a deletion is never content to capture)
  if (/^(?:帮我)?(?:把)?(.{1,50}?)(?:删了|删掉|删除|删除掉)[。!！~～]*$/.test(m) || /^(?:帮我)?删除/.test(m) || /^删掉/.test(m)) return 'delete'
  // modify command: 改期 / 改优先级 / 开始执行 / 改名（改动既有任务，不是新建）
  if (parseTaskCommand(m)) return 'modify'
  // open questions → answer (or hand to the LLM), don't silently file a todo
  if (/[?？]$/.test(m)) return 'question'
  if (/^(为什么|什么是|如何|怎么样|怎么办|是不是|能不能|可不可以|有没有)/.test(m) && m.length <= 40) return 'question'
  return 'capture'
}

// High-precision multi-item split: newlines / semicolons / numbered lists only
// (顿号 stays intact — "研究 Cubox、OmniFocus" is one item; the LLM handles those).
export function splitSegments(text) {
  const t = String(text || '').trim()
  const parts = t.split(/\n+|；|;|(?:^|\s)\d+[.、]\s*/).map((s) => s.trim()).filter((s) => s.length >= 4)
  if (parts.length < 2 || parts.length > 8) return [t]
  return parts
}

// Extract the task title a complete/delete command refers to.
export function extractCommandTarget(message) {
  const m = String(message || '').trim()
  const pats = [
    /^(?:帮我)?(?:把)?[「"'『]?(.+?)[」"'』]?\s*(?:标记为?完成|置为完成|标记完成|完成掉|搞定了|做完了|已完成|完成了)[。!！~～]*$/,
    /^完成(?:任务)?[:：]\s*[「"'『]?(.+?)[」"'』]?[。!！~～]*$/,
    /^(?:帮我)?(?:把)?[「"'『]?(.+?)[」"'』]?\s*(?:删了|删掉|删除掉|删除)[。!！~～]*$/,
    /^(?:帮我)?(?:删除|删掉)(?:任务)?[:：\s]*[「"'『]?(.+?)[」"'』]?[。!！~～]*$/,
  ]
  for (const p of pats) {
    const mm = m.match(p)
    if (mm && mm[1]) return mm[1].trim().replace(/^(任务|这个|那个)\s*/, '')
  }
  return ''
}

const cleanTarget = (s) => String(s || '').trim().replace(/^(任务|这个|那个|一下)\s*/, '').replace(/\s*(任务|一下)$/, '').trim()
function toPriority(tok) {
  const t = String(tok || '').trim()
  const map = { 1: 1, 2: 2, 3: 3, 4: 4, 一: 1, 二: 2, 三: 3, 四: 4, 最高: 1, 高: 1, 重要: 1, 中: 3, 普通: 3, 一般: 3, 低: 4, 最低: 4 }
  return map[t] || null
}

// 解析"修改既有任务"的命令 → {op:'due'|'priority'|'status'|'title', target, value}，否则 null。
// 用具体动词（改到/推迟到、设为P?/优先级、开始执行/进行中、改名为）保证不误伤"新建任务"的输入。
export function parseTaskCommand(message) {
  const m = String(message || '').trim()
  if (!m) return null
  // 改名：把X改名为Y / 重命名X为Y / X标题改成Y / X改叫Y
  let mm = m.match(/^(?:帮我|请)?(?:把|将)?\s*[「"'『]?(.+?)[」"'』]?\s*(?:改名为?|重命名为?|标题改(?:成|为)?|名字改(?:成|为)?|改叫)\s*[「"'『]?(.+?)[」"'』]?[。!！~～]*$/)
  if (mm && mm[1] && mm[2]) return { op: 'title', target: cleanTarget(mm[1]), value: mm[2].trim() }
  // 优先级：把X设为P1 / X改成高优先级 / 把X降为P3（需 P数字 或 优先级/级 语境）
  mm = m.match(/^(?:帮我|请)?(?:把|将)?\s*[「"'『]?(.+?)[」"'』]?\s*(?:的优先级)?\s*(?:设为|设成|设置为?|改(?:成|为)?|调(?:成|为)?|降为|升为|标为|定为)\s*(?:优先级\s*)?(?:p|P)\s*([1-4])\b[。!！~～]*$/)
  if (mm && mm[1]) return { op: 'priority', target: cleanTarget(mm[1]), value: Number(mm[2]) }
  mm = m.match(/^(?:帮我|请)?(?:把|将)?\s*[「"'『]?(.+?)[」"'』]?\s*(?:设为|设成|设置为?|改(?:成|为)?|调(?:成|为)?|降为|升为|标为|定为)\s*(最高|最低|高|中|低|重要|普通|一般|[一二三四1-4])\s*(?:优先级|级)[。!！~～]*$/)
  if (mm && mm[1]) { const pr = toPriority(mm[2]); if (pr) return { op: 'priority', target: cleanTarget(mm[1]), value: pr } }
  // 改期：把X改到/推迟到/提前到 <时间>
  mm = m.match(/^(?:帮我|请)?(?:把|将)?\s*[「"'『]?(.+?)[」"'』]?\s*(?:的?(?:截止|deadline|ddl|due)\s*)?(?:改到|推迟到|延后到|延到|提前到|挪到|移到|调到|改期到|截止改?到)\s*(.+?)[。!！~～]*$/i)
  if (mm && mm[1] && mm[2]) { const due = detectDue(mm[2]); if (due) return { op: 'due', target: cleanTarget(mm[1]), value: due } }
  // 开始执行 / 进行中（需明确措辞，避免把"开始健身"这类新建当成改状态）
  mm = m.match(/^(?:帮我|请)?(?:把|将)?\s*[「"'『]?(.+?)[」"'』]?\s*(?:开始执行|设为进行中|标记为?进行中|设成进行中|置为进行中|正在进行)[。!！~～]*$/)
  if (mm && mm[1]) return { op: 'status', target: cleanTarget(mm[1]), value: 'in_progress' }
  mm = m.match(/^(?:帮我|请)?(?:开始执行|着手处理)\s*[:：]?\s*[「"'『]?(.+?)[」"'』]?[。!！~～]*$/)
  if (mm && mm[1]) return { op: 'status', target: cleanTarget(mm[1]), value: 'in_progress' }
  return null
}

// AiProvider implementation (async to match the LLM-backed interface).
export const ruleProvider = {
  name: 'rule',
  async triageInput(text, _context) {
    return triageInputSync(text)
  },
}
