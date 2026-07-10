// 时间快捷词展开：把 @today / @now / @明天 等写进任务输入的时间别名，
// 就地替换成用户当前时区下的具体日期/时间。纯函数，便于回归测试。
//
// 规则：
//   即时类 @now / @现在        -> YYYY-MM-DD HH:mm
//   纯时间 @time              -> HH:mm
//   日期类 @today/@date/@今天  -> YYYY-MM-DD（其它日期别名按天偏移）
//   未识别的 @xxx 原样保留；不触碰 @人名提及、#标签、命令等其它文本。

// 别名 -> 规则。kind: 'datetime' | 'time' | 'date'(带 off 天偏移)
interface Rule { al: string[]; kind: 'datetime' | 'time' | 'date'; off?: number }
const RULES: Rule[] = [
  { al: ['now', '现在'], kind: 'datetime' },
  { al: ['time'], kind: 'time' },
  { al: ['today', 'date', '今天'], kind: 'date', off: 0 },
  { al: ['tomorrow', '明天'], kind: 'date', off: 1 },
  { al: ['yesterday', '昨天'], kind: 'date', off: -1 },
  { al: ['后天'], kind: 'date', off: 2 },
  { al: ['前天'], kind: 'date', off: -2 },
]
const MAP: Record<string, Rule> = {}
for (const r of RULES) for (const a of r.al) MAP[a] = r
// CJK 别名（按长度降序，供"@明天开会"这类前缀匹配）
const CJK = Object.keys(MAP).filter((a) => /[一-鿿]/.test(a)).sort((a, b) => b.length - a.length)

const pad = (n: number): string => String(n).padStart(2, '0')

// 取某一时刻在指定时区下的 年/月/日/时/分。
function partsInTz(date: Date, timeZone: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const o: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) if (p.type !== 'literal') o[p.type] = p.value
  let h = parseInt(o.hour!, 10)
  if (h === 24) h = 0 // 某些环境午夜给 "24"
  return { y: +o.year!, mo: +o.month!, d: +o.day!, h, mi: +o.minute! }
}

export function expandTimeTokens(text: string, opts: { now?: Date; timeZone?: string } = {}): string {
  const s = String(text == null ? '' : text)
  if (s.indexOf('@') < 0) return s
  let tz = opts.timeZone
  if (!tz) { try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { tz = 'UTC' } }
  const p = partsInTz(opts.now ?? new Date(), tz)
  const dateStr = (off?: number): string => {
    const u = new Date(Date.UTC(p.y, p.mo - 1, p.d)) // 用日历部件构造 UTC 零点，纯做加天，避免跨月/年出错
    u.setUTCDate(u.getUTCDate() + (off || 0))
    return `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())}`
  }
  const timeStr = (): string => `${pad(p.h)}:${pad(p.mi)}`
  const render = (r: Rule): string => (r.kind === 'datetime' ? `${dateStr(0)} ${timeStr()}` : r.kind === 'time' ? timeStr() : dateStr(r.off))

  return s.replace(/@([A-Za-z]+|[一-鿿]+)/g, (m, word: string) => {
    if (/^[A-Za-z]/.test(word)) { const r = MAP[word.toLowerCase()]; return r ? render(r) : m } // 英文整段精确匹配（大小写不敏感）
    for (const a of CJK) { const r = MAP[a]; if (r && word.startsWith(a)) return render(r) + word.slice(a.length) } // 中文取最长别名前缀
    return m
  })
}

// 文本里是否含可展开的时间快捷词（用于决定是否需要就地替换）。
export function hasTimeToken(text: string): boolean {
  return expandTimeTokens(text, { now: new Date() }) !== String(text == null ? '' : text)
}
