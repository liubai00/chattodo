// @linx/domain-collab — 任务协作模型 + 端口 + 纯文本工具（承接 server/src/services/collab.js 的纯部分）。
// 规则：任务归 owner，邀请-确认制；拒后 24h 冷却；可随时退出；共享任务完成通知 owner+协作者+关注者。

export type CollabStatus = 'pending' | 'accepted' | 'declined' | 'left' | 'following'

export interface Collaborator {
  id: string
  taskId: string
  ownerId: string
  userId: string
  invitedBy: string
  status: CollabStatus
  remind: boolean
  createdAt: string
  respondedAt: string | null
}

export interface AutoRule {
  id: string
  userId: string
  keyword: string
  action: string
  targetId: string
  targetName: string
  createdAt: string
}

/** 邀请响应模式：accept | decline | follow（→ following）。 */
export type RespondMode = 'accept' | 'decline' | 'follow'

/** 拒绝后的重复邀请冷却（现网硬编码 24h）。 */
export const INVITE_COOLDOWN_MS = 24 * 3600_000

/** mode → 落库状态。 */
export function decisionOf(mode: RespondMode): CollabStatus {
  return mode === 'follow' ? 'following' : mode === 'accept' ? 'accepted' : 'declined'
}

// —— 结构化 @提及 ——
export type MentionType = 'person' | 'time' | 'doc'
export interface Mention {
  type: MentionType
  label?: string
  userId?: string
  iso?: string
  entityType?: string
}

export interface CollaboratorRepo {
  /** 幂等邀请：复用未拒绝行 / declined 且过冷却期才可重发；冷却内返回 null。返回 {collab,reused} | null。 */
  invite(taskId: string, targetUserId: string): Promise<{ collab: Collaborator; reused: boolean } | null>
  get(id: string): Promise<Collaborator | undefined>
  /** addressee 响应；非本人 pending 行返回 null。 */
  respond(id: string, decision: CollabStatus, remind: boolean): Promise<Collaborator | undefined>
  leave(taskId: string, userId: string): Promise<boolean>
  /** 完成通知的接收者：accepted + following（不含操作者，调用方过滤）。 */
  watchersOf(taskId: string): Promise<string[]>
  removeForTask(taskId: string): Promise<void>
}

export interface AutoRuleRepo {
  all(): Promise<AutoRule[]>
  create(keyword: string, targetId: string, targetName: string): Promise<AutoRule>
}

// ————————————————————————————————————————————————————————————————
// 纯文本工具（1:1 承接 collab.js）——无 IO，供 app-collab 与测试直接复用。
// ————————————————————————————————————————————————————————————————

const escapeRe = (s: string): string => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 消息里的原始 @名字（可能匹配不到用户；用于识别"未知成员"）。 */
export function rawMentionNames(text: string): string[] {
  return [
    ...new Set(
      [...String(text || '').matchAll(/@([^\s@，。,、.!！?？:：]{1,20})/g)].map((m) => m[1] as string),
    ),
  ]
}

/** 把结构化 @提及（人/时间/文档）汇总成给 LLM 的分类清单，帮助模型区分意图。 */
export function summarizeMentions(mentions: readonly Mention[] | undefined): string {
  if (!Array.isArray(mentions) || !mentions.length) return ''
  const persons = mentions.filter((m) => m.type === 'person').map((m) => m.label).filter(Boolean)
  const times = mentions.filter((m) => m.type === 'time')
  const docs = mentions.filter((m) => m.type === 'doc')
  const lines: string[] = []
  if (persons.length) lines.push(`- 人（成员，需要协作时邀请，不是任务内容）：${persons.join('、')}`)
  if (times.length) lines.push(`- 时间（作为任务截止时间）：${times.map((t) => t.label || t.iso).join('、')}`)
  if (docs.length)
    lines.push(
      `- 文档/引用（已存在的内容，供参考）：${docs
        .map((d) => `${d.entityType === 'project' ? '项目' : d.entityType === 'note' ? '笔记' : '任务'}《${d.label}》`)
        .join('、')}`,
    )
  return lines.join('\n')
}

/**
 * 去掉 LLM 回复里关于"已邀请/已通知某人协作"的断言小句——这些常与真实结果不符，
 * 统一改由权威状态行覆盖，杜绝自相矛盾。基于「协作语义 + 具体人」判断，对任意表达健壮。
 */
export function stripInviteClaims(reply: string, names: readonly string[] = []): string {
  const STRONG =
    /(已?邀请了?|邀请已(发出|发送|送达)|发出邀请|发送邀请|已?通知了?|会通知|已叫上|已拉上|已抄送|已为你邀请|已帮你邀请|已把.{0,10}(加入|拉进|拉入).{0,6}协作|已(将|把).{0,10}设为(协作者|参与人|负责人)|已指派给)/
  const COLLAB = /(邀请|协作|参与|加入|叫上|拉上|抄送|一起(做|干|完成|参与|处理|推进))/
  const PRON = /(他|她|对方|大家|成员|你们|各位|TA|ta)/
  const NAMES = names.length ? new RegExp(names.map(escapeRe).join('|')) : null
  const mentionsPerson = (seg: string): boolean => (NAMES !== null && NAMES.test(seg)) || PRON.test(seg)
  const isClaim = (seg: string): boolean => STRONG.test(seg) || (COLLAB.test(seg) && mentionsPerson(seg))
  return String(reply || '')
    .split('\n')
    .map((line) => {
      if (!isClaim(line)) return line
      const kept = line
        .split(/(?<=[，,。；;、\n])/)
        .filter((seg) => !isClaim(seg))
        .join('')
      return kept.replace(/[，,、；;]\s*$/g, '。')
    })
    .join('\n')
    .replace(/。{2,}/g, '。')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 从记忆/备注里解析自动化协作规则（"以后合同类的任务都邀请张伟"）的纯部分。
 * 返回 {keyword, name} 或 null；用户存在性 / 好友校验 / 去重由 app 层完成。
 */
export function parseAutoRule(note: string): { keyword: string; name: string } | null {
  const m = String(note || '').match(
    /(?:以后|今后|之后)[，,]?(.{1,16}?)(?:相关|类|方面)?的?任务[，,]?(?:都|一律|自动|记得)?(?:邀请|带上|抄送|叫上)\s*@?([^\s@，。,、!！?？]{1,20})/,
  )
  if (!m) return null
  const keyword = (m[1] as string).trim().replace(/^(所有|全部)/, '')
  const name = (m[2] as string).trim()
  if (!keyword || !name) return null
  return { keyword, name }
}
