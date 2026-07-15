// @linx/agent-planner-rule — 规则版 triage / 意图分诊 / 任务命令解析（纯，零 I/O）。
// 逐字节承接现网 server/src/services/triage/ruleProvider.js（P7 由 agent-core 包成 RulePlanner）。
// 时间以 nowMs 注入（默认 Date.now()），便于确定性测试；产出本地朴素 ISO（秒 00，与现网一致）。

export type PrivacyScope = 'work' | 'personal' | 'mixed'
export type TriageKind = 'task' | 'todo_idea' | 'non_todo'

export interface TriageTask {
  kind: 'task'
  title: string
  reason: string
  confidence: number
  dueAt: string | null
  plannedAt: null
  durationMinutes: null
  priority: number
  privacyScope: PrivacyScope
  tags: string[]
  context: string
}
export interface TriageIdea {
  kind: 'todo_idea'
  title: string
  reason: string
  confidence: number
  suggestedNextAction: string
  privacyScope: PrivacyScope
}
export interface TriageNon {
  kind: 'non_todo'
  title: string
  summary: string
  reason: string
  suggestedDestination: string
  confidence: number
  privacyScope: PrivacyScope
}
export type TriageResult = TriageTask | TriageIdea | TriageNon

export type ChatIntent =
  | 'greeting'
  | 'help'
  | 'remember'
  | 'plan'
  | 'query'
  | 'complete'
  | 'delete'
  | 'modify'
  | 'question'
  | 'capture'

export interface TaskCommand {
  op: 'title' | 'priority' | 'status' | 'due'
  target: string
  value: string | number
}

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
const TIME_HINTS: ReadonlyArray<readonly [string, number | null]> = [
  ['今天', 0], ['今晚', 0], ['明天', 1], ['后天', 2],
  ['下周', 7], ['周一', null], ['周二', null], ['周三', null],
  ['周四', null], ['周五', null], ['周末', null], ['月底', null], ['本周', null],
]
const PERSONAL_MARKERS = ['家', '家里', '孩子', '老婆', '老公', '父母', '健身', '医院', '看病', '私人', '生日', '约会']
const WORK_MARKERS = ['评审', 'prd', 'mvp', '文档', '需求', '项目', '客户', '老板', '同事', '会议', '上线', '接口', 'api', '代码']

const pad = (n: number): string => String(n).padStart(2, '0')

interface HourMin {
  h: number
  min: number
}

function detectHour(text: string): HourMin | null {
  const cn: Record<string, number> = {
    一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
  }
  const m = String(text).match(/([0-9]{1,2}|十[一二]?|[一两二三四五六七八九])\s*点(半)?/)
  if (!m) return null
  const raw = m[1]!
  let h = /^[0-9]+$/.test(raw) ? parseInt(raw, 10) : cn[raw]
  if (h == null || h > 24) return null
  if (/(晚上|下午|傍晚|晚间|pm)/i.test(text) && h < 12) h += 12
  return { h, min: m[2] ? 30 : 0 }
}

function isoDaysFromNow(days: number, hm: HourMin | null, nowMs: number): string {
  const d = new Date(nowMs)
  d.setDate(d.getDate() + days)
  const h = hm ? hm.h : 18
  const min = hm ? hm.min : 0
  d.setHours(h, min, 0, 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(min)}:00`
}

export function detectDue(text: string, nowMs: number = Date.now()): string | null {
  const hm = detectHour(text)
  for (const [hint, days] of TIME_HINTS) {
    if (text.includes(hint) && days !== null) return isoDaysFromNow(days, hm, nowMs)
  }
  const weekMap: Record<string, number> = { 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6, 周日: 0, 周末: 6 }
  for (const key of Object.keys(weekMap)) {
    if (text.includes(key)) {
      const target = weekMap[key]!
      const now = new Date(nowMs)
      let delta = (target - now.getDay() + 7) % 7
      if (delta === 0) delta = 7
      return isoDaysFromNow(delta, hm, nowMs)
    }
  }
  return null
}

export function detectScope(text: string): PrivacyScope {
  const t = text.toLowerCase()
  const personal = PERSONAL_MARKERS.some((m) => text.includes(m))
  const work = WORK_MARKERS.some((m) => t.includes(m))
  if (personal && !work) return 'personal'
  if (work && !personal) return 'work'
  if (personal && work) return 'mixed'
  return 'work'
}

export function makeTitle(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ')
  if (cleaned.length <= 24) return cleaned
  return cleaned.slice(0, 22) + '…'
}

function detectPriority(text: string, due: string | null, nowMs: number): number {
  if (text.includes('紧急') || text.includes('马上') || text.includes('立刻')) return 1
  if (due) {
    const ms = new Date(due).getTime() - nowMs
    const days = ms / (1000 * 60 * 60 * 24)
    if (days <= 2) return 1
    if (days <= 5) return 2
  }
  return 3
}

function detectTags(text: string): string[] {
  const tags: string[] = []
  const t = text.toLowerCase()
  if (WORK_MARKERS.some((m) => t.includes(m))) tags.push('工作')
  if (PERSONAL_MARKERS.some((m) => text.includes(m))) tags.push('个人')
  if (text.includes('文档') || text.includes('prd') || t.includes('doc')) tags.push('文档')
  if (text.includes('研究') || text.includes('调研')) tags.push('调研')
  return tags
}

/** 纯分类：承接现网 triageInputSync（rule 版）。 */
export function triageInputSync(text: string, nowMs: number = Date.now()): TriageResult {
  const trimmed = text.trim()
  const due = detectDue(trimmed, nowMs)
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
      priority: detectPriority(trimmed, due, nowMs),
      privacyScope: scope,
      tags: detectTags(trimmed),
      context: scope === 'work' ? '电脑前' : '任意',
    }
  }

  if (due && detectHour(trimmed) && !isVague && !isNonTodo) {
    return {
      kind: 'task',
      title: makeTitle(trimmed),
      reason: '包含明确时间约束，判定为需要执行的安排。',
      confidence: 0.85,
      dueAt: due,
      plannedAt: null,
      durationMinutes: null,
      priority: detectPriority(trimmed, due, nowMs),
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

const PLAN_MARKERS = ['做什么', '接下来', '安排什么', '该干嘛', '下一步做', '两小时', '怎么安排', '规划一下', '帮我规划', '帮我安排']
const CAPTURE_HINTS = /(记一下|记个|提醒我|帮我记|加个任务|新建任务|加一条|建个任务)/

export function detectIntent(message: string): ChatIntent {
  const m = String(message ?? '').trim()
  if (!m) return 'capture'
  if (CAPTURE_HINTS.test(m)) return 'capture'
  if (/^(你好|您好|hi|hello|嗨|哈喽|hey|早上好|下午好|晚上好|早安|晚安|在吗|在不在|谢谢|谢啦|辛苦了)[呀啊哦呢!！。?？~～\s]*$/i.test(m)) return 'greeting'
  if (m.length <= 24 && /(你是谁|你能做什么|你会什么|你能干什么|能干嘛|会干嘛|怎么用|使用说明|有什么功能|帮助|help)/i.test(m)) return 'help'
  if (/^记住[:：，,\s]/.test(m) || /^(以后|下次|每次)(都|请|一律|默认)/.test(m)) return 'remember'
  if (PLAN_MARKERS.some((k) => m.includes(k))) return 'plan'
  if (/^(有什么|有哪些|哪些|列出|列一下|看看我?|查看|查一下|查询|显示|盘点|汇总|统计)/.test(m) && /(任务|待办|todo|事情|安排|到期|没做|完成)/i.test(m)) return 'query'
  if (/(到期|逾期|过期)/.test(m) && /(哪些|什么|有没有|多少)/.test(m) && m.length <= 30) return 'query'
  if (/^(任务|待办|todo)(列表|清单)?[?？]?$/i.test(m)) return 'query'
  if (/^(?:帮我)?(?:把)?(.{1,50}?)(?:标记为?完成|置为完成|标记完成|完成掉|搞定了|做完了|已完成|完成了)[。!！~～]*$/.test(m) || /^完成(?:任务)?[:：]/.test(m)) return 'complete'
  if (/^(?:帮我)?(?:把)?(.{1,50}?)(?:删了|删掉|删除|删除掉)[。!！~～]*$/.test(m) || /^(?:帮我)?删除/.test(m) || /^删掉/.test(m)) return 'delete'
  if (parseTaskCommand(m)) return 'modify'
  if (/[?？]$/.test(m)) return 'question'
  if (/^(为什么|什么是|如何|怎么样|怎么办|是不是|能不能|可不可以|有没有)/.test(m) && m.length <= 40) return 'question'
  return 'capture'
}

/** 多事拆分：仅按换行 / 分号 / 编号列表切（顿号保持一体）。 */
export function splitSegments(text: string): string[] {
  const t = String(text ?? '').trim()
  const parts = t
    .split(/\n+|；|;|(?:^|\s)\d+[.、]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
  if (parts.length < 2 || parts.length > 8) return [t]
  return parts
}

export function extractCommandTarget(message: string): string {
  const m = String(message ?? '').trim()
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

const cleanTarget = (s: string): string =>
  String(s ?? '')
    .trim()
    .replace(/^(任务|这个|那个|一下)\s*/, '')
    .replace(/\s*(任务|一下)$/, '')
    .trim()

function toPriority(tok: string): number | null {
  const t = String(tok ?? '').trim()
  const map: Record<string, number> = {
    '1': 1, '2': 2, '3': 3, '4': 4, 一: 1, 二: 2, 三: 3, 四: 4,
    最高: 1, 高: 1, 重要: 1, 中: 3, 普通: 3, 一般: 3, 低: 4, 最低: 4,
  }
  return map[t] ?? null
}

/** 解析"修改既有任务"的命令 → {op, target, value}，否则 null。 */
export function parseTaskCommand(message: string, nowMs: number = Date.now()): TaskCommand | null {
  const m = String(message ?? '').trim()
  if (!m) return null
  let mm = m.match(/^(?:帮我|请)?(?:把|将)?\s*[「"'『]?(.+?)[」"'』]?\s*(?:改名为?|重命名为?|标题改(?:成|为)?|名字改(?:成|为)?|改叫)\s*[「"'『]?(.+?)[」"'』]?[。!！~～]*$/)
  if (mm && mm[1] && mm[2]) return { op: 'title', target: cleanTarget(mm[1]), value: mm[2].trim() }
  mm = m.match(/^(?:帮我|请)?(?:把|将)?\s*[「"'『]?(.+?)[」"'』]?\s*(?:的优先级)?\s*(?:设为|设成|设置为?|改(?:成|为)?|调(?:成|为)?|降为|升为|标为|定为)\s*(?:优先级\s*)?(?:p|P)\s*([1-4])\b[。!！~～]*$/)
  if (mm && mm[1]) return { op: 'priority', target: cleanTarget(mm[1]), value: Number(mm[2]) }
  mm = m.match(/^(?:帮我|请)?(?:把|将)?\s*[「"'『]?(.+?)[」"'』]?\s*(?:设为|设成|设置为?|改(?:成|为)?|调(?:成|为)?|降为|升为|标为|定为)\s*(最高|最低|高|中|低|重要|普通|一般|[一二三四1-4])\s*(?:优先级|级)[。!！~～]*$/)
  if (mm && mm[1]) {
    const pr = toPriority(mm[2]!)
    if (pr) return { op: 'priority', target: cleanTarget(mm[1]), value: pr }
  }
  mm = m.match(/^(?:帮我|请)?(?:把|将)?\s*[「"'『]?(.+?)[」"'』]?\s*(?:的?(?:截止|deadline|ddl|due)\s*)?(?:改到|推迟到|延后到|延到|提前到|挪到|移到|调到|改期到|截止改?到)\s*(.+?)[。!！~～]*$/i)
  if (mm && mm[1] && mm[2]) {
    const due = detectDue(mm[2], nowMs)
    if (due) return { op: 'due', target: cleanTarget(mm[1]), value: due }
  }
  mm = m.match(/^(?:帮我|请)?(?:把|将)?\s*[「"'『]?(.+?)[」"'』]?\s*(?:开始执行|设为进行中|标记为?进行中|设成进行中|置为进行中|正在进行)[。!！~～]*$/)
  if (mm && mm[1]) return { op: 'status', target: cleanTarget(mm[1]), value: 'in_progress' }
  mm = m.match(/^(?:帮我|请)?(?:开始执行|着手处理)\s*[:：]?\s*[「"'『]?(.+?)[」"'』]?[。!！~～]*$/)
  if (mm && mm[1]) return { op: 'status', target: cleanTarget(mm[1]), value: 'in_progress' }
  return null
}
