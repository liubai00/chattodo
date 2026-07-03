import { detectIntent, extractCommandTarget, triageInputSync } from './triage/index.js'
import { detectDue, splitSegments } from './triage/ruleProvider.js'
import { planNextBlock } from './planning.js'
import { visibleFilter } from './privacy.js'
import { persistCapture } from './capture.js'
import { agentChat, appendMemory } from './agentChat.js'
import { convertIdeaToTask } from './ideas.js'
import { inviteFx, respondInviteFx, extractMentionedUsers, notifyTaskDoneFx, maybeCreateAutoRule, applyAutoInvitesFx } from './collab.js'
import { requestFriendByIdFx, requestFriendFx, respondFriendFx, friendsOverview } from './friends.js'

// 澄清闭环：15 分钟内经聊天产生、仍待澄清的想法（用户的下一条补充可直接转正式任务）。
async function findPendingClarify(repos) {
  const idea = (await repos.ideas.all()).find((i) => i.status === 'clarifying' && i.source === 'chat')
  if (!idea) return null
  return (Date.now() - new Date(idea.createdAt).getTime() < 15 * 60 * 1000) ? idea : null
}

// 身份/模型提问："你是什么模型 / 你是谁 / 基于什么大模型"。
// 由后端用真实配置直接回答——模型本身常被系统提示带偏而含糊其辞。
export function isIdentityQuestion(message) {
  const m = String(message || '').trim()
  if (m.length > 16) return false // 身份提问都很短；长句多半是含"模型"二字的普通任务
  // 必须是对「你/您」的自我指涉，避免把"买个什么模型的手办"这类任务误判
  if (/^(你|您|你们)/.test(m) && /(什么|啥|哪个|哪家|哪种).{0,3}(模型|大模型|大语言模型|ai|llm)/i.test(m)) return true
  if (/^(你|您)是谁[?？]?$/.test(m)) return true
  if (/^(你|您)(叫什么|叫啥|的名字|是什么).{0,5}$/.test(m)) return true
  if (/(什么|哪个|啥)模型(驱动|支持|在跑|运行|的你)/.test(m)) return true
  return false
}

export function identityReply(aiConfig) {
  if (!aiConfig || aiConfig.provider === 'rule' || !aiConfig.apiKey) {
    return '我是 LinX 灵信的 todo-first 智能助理，目前运行在离线规则模式（尚未接入大语言模型）。在「设置 · AI 接入」配置模型后，我就能自然对话并代你操作任务。'
  }
  const model = aiConfig.model || '（未指定型号）'
  let host = ''
  try { host = new URL(/:\/\//.test(aiConfig.baseUrl || '') ? aiConfig.baseUrl : 'https://' + (aiConfig.baseUrl || 'api.anthropic.com')).hostname } catch { /* ignore */ }
  const via = aiConfig.provider === 'anthropic' ? 'Anthropic 官方接口' : (host || 'OpenAI 兼容接口')
  return `我是 LinX 灵信的 todo-first 智能助理，当前由模型 ${model} 驱动（接入自 ${via}）。我能把你的想法判断为任务 / 待澄清 / 非 todo，安排计划，并和团队协作。`
}

// 重复检测：7 天内已有同名（忽略空白/大小写）未归档任务。
async function findDuplicate(repos, text) {
  const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase()
  const q = norm(text)
  if (!q) return null
  const weekAgo = Date.now() - 7 * 86400000
  return (await repos.tasks.all()).find((t) => t.status !== 'archived' && new Date(t.createdAt).getTime() > weekAgo && norm(t.title) === q) || null
}

// Unified chat-turn result consumed by the frontend:
// { intent, reply, entities:[{type,entity}], plan|null, performed:[...], userMessage, agentMessage }
async function finish(repos, { message, intent, reply, entities = [], plan = null, performed = [], isError = false }) {
  const userMessage = await repos.chat.create({ role: 'user', text: message })
  const agentMessage = await repos.chat.create({ role: 'agent', text: reply, isError })
  return { intent, reply, entities, plan, performed, userMessage, agentMessage }
}

const fmtDue = (iso) => {
  if (!iso) return '待定'
  const d = new Date(iso); const t = new Date()
  const sod = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const diff = Math.round((sod(d) - sod(t)) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff < 0) return `已逾期 ${-diff} 天`
  if (diff <= 6) return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const openTasksOf = async (repos) => {
  const settings = await repos.settings.get()
  return visibleFilter(await repos.tasks.all(), settings).filter((t) => t.status !== 'done' && t.status !== 'archived')
}

// Fuzzy title match for complete/delete commands.
function matchTasks(tasks, target) {
  if (!target) return []
  const q = target.toLowerCase()
  const exact = tasks.filter((t) => t.title.toLowerCase() === q)
  if (exact.length) return exact
  return tasks.filter((t) => t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase()))
}

const listLines = (tasks) => tasks.map((t, i) => `${i + 1}. ${t.title}（${fmtDue(t.dueAt)} · P${t.priority}）`).join('\n')

// Rule-based chat (offline): understands direct commands / questions and only
// captures real content — the "everything becomes a todo" behavior is gone.
async function ruleChat(repos, { message, db, user }) {
  // 协作邀请响应：有待处理邀请时，「接受 / 拒绝」直接生效（对话式确认）
  if (db) {
    const pending = await repos.collaborators.myPending()
    const m = message.trim()
    if (pending.length && m.length <= 12 && /^(接受|好的?|可以|行|加入|同意|关注|仅关注|只关注|拒绝|不了|不用了?|先不|婉拒)[!！。~～]*$/.test(m)) {
      const mode = /^(仅?只?关注)/.test(m) ? 'follow' : /^(接受|好的?|可以|行|加入|同意)/.test(m) ? 'accept' : 'decline'
      const inv = pending[0]
      const r = await respondInviteFx(db, repos, user, inv.id, mode, true)
      if (r) {
        const rest = pending.length - 1
        const tail = rest > 0 ? `\n（还有 ${rest} 条待处理邀请）` : ''
        const reply = mode === 'accept'
          ? `✅ 已加入「${r.taskTitle}」的协作，任务已进入你的 Todo 数据库并开启到期提醒。${tail}`
          : mode === 'follow'
            ? `👀 已关注「${r.taskTitle}」——不进入你的任务库，进展（如完成）会通知你。${tail}`
            : `已婉拒「${r.taskTitle}」的协作邀请，已通知 ${inv.inviterName}。${tail}`
        return finish(repos, {
          message, intent: 'respond_invite', reply,
          entities: mode === 'accept' && r.task ? [{ type: 'task', entity: r.task }] : [],
          performed: [{ type: 'respond_invite', id: inv.id, accept: mode !== 'decline', mode }],
        })
      }
    }
  }

  // 好友（对话式）：加好友 xx@yy.com / 同意·拒绝好友请求
  if (db && user) {
    const m = message.trim()
    const em = (m.match(/([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/) || [])[1]
    // 显式加好友：以「加好友」开头，或消息里带邮箱且提到加好友。
    // 注意不能松成 /加.{0,2}好友/ ——「参加好友婚礼」这类正常任务会被误吞。
    const explicitAdd = /^(?:帮我|请)?(?:加|添加|新增)(?:个|一个)?好友/.test(m)
      || (!!em && /(加|添加|新增).{0,3}好友|好友.{0,3}(加|添加)|加为好友/.test(m))
    if (explicitAdd && m.length <= 60) {
      if (!em) {
        return finish(repos, { message, intent: 'friend', reply: '添加好友需要对方的完整注册邮箱（不提供按名字搜索，保护隐私）。直接发「加好友 对方邮箱」即可。' })
      }
      const r = await requestFriendFx(db, user, em)
      const reply = r.error ? `好友请求未发出：${r.error}`
        : r.already ? `你和 ${r.target.name} 已经是好友了，可以直接 @${r.target.name} 邀请协作。`
          : r.pending ? `你已经向 ${r.target.name} 发过好友请求了，等对方处理即可。`
            : r.autoAccepted ? `🤝 你们互相发过请求——已直接和 ${r.target.name} 成为好友！现在可以互相 @提及与邀请协作。`
              : `👋 已向 ${r.target.name} 发送好友请求，对方在通知中心接受后即可互相协作。`
      return finish(repos, {
        message, intent: 'friend', reply, isError: !!r.error,
        performed: r.error ? [] : [{ type: 'add_friend', email: em, userName: r.target && r.target.name, auto: !!r.autoAccepted, already: !!r.already }],
      })
    }
    if (/^(同意|接受|通过|拒绝|婉拒|不加).{0,6}好友/.test(m) && m.length <= 20) {
      const accept = /^(同意|接受|通过)/.test(m)
      const { incoming } = await friendsOverview(db, user.id)
      if (!incoming.length) return finish(repos, { message, intent: 'friend', reply: '当前没有待处理的好友请求。' })
      const req0 = incoming[0]
      const r = await respondFriendFx(db, user, req0.friendshipId, accept)
      const rest = incoming.length - 1
      const tail = rest > 0 ? `（还有 ${rest} 条好友请求待处理）` : ''
      return finish(repos, {
        message, intent: 'friend',
        reply: r ? (accept ? `🤝 已和 ${req0.name} 成为好友，现在可以互相 @提及与邀请协作。${tail}` : `已拒绝 ${req0.name} 的好友请求（不会通知对方）。${tail}`) : '这条好友请求已被处理过了。',
        performed: r ? [{ type: 'respond_friend', friendshipId: req0.friendshipId, accept }] : [],
      })
    }
  }

  const intent = detectIntent(message)

  if (intent === 'greeting') {
    return finish(repos, { message, intent, reply: '你好，我在。把想法、任务直接丢给我，我来判断与整理；也可以问我「接下来做什么」，或说「把 XX 标记完成」。' })
  }

  if (intent === 'help') {
    return finish(repos, {
      message, intent,
      reply: '我是你的 todo-first 助理，你可以：\n1. 直接丢一句想法 → 我判断是任务 / 待澄清 / 非 todo 并归档；\n2. 问「接下来两小时做什么」→ 生成执行计划；\n3. 说「有哪些任务 / 今天到期的任务」→ 查询清单；\n4. 说「把 XX 标记完成」「删除 XX」→ 直接操作任务；\n5. 在设置 · AI 接入里配置真实模型后，我还能自然对话并代你操作。',
    })
  }

  if (intent === 'plan') {
    const settings = await repos.settings.get()
    const tasks = visibleFilter(await repos.tasks.all(), settings)
    const { plan } = planNextBlock(tasks)
    const reply = plan.length === 0
      ? '当前可见 todo 中没有可安排的任务。先添加几条任务，或切换隐私范围试试。'
      : `基于当前可见 todo，建议接下来这样安排：\n${plan.map((p, i) => `${i + 1}. ${p.task.title}（约 ${p.minutes} 分钟）`).join('\n')}\n\n（已排除 NonTodo 隔离输出与隐私隐藏的任务）`
    return finish(repos, { message, intent, reply, plan })
  }

  if (intent === 'query') {
    const open = await openTasksOf(repos)
    const m = message
    let list = open; let label = '未完成任务'
    const sod = (x) => { const d = new Date(x); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
    const today = sod(new Date())
    if (/(今天|今日)/.test(m)) { list = open.filter((t) => t.dueAt && sod(t.dueAt) === today); label = '今天到期' }
    else if (/(逾期|过期)/.test(m)) { list = open.filter((t) => t.dueAt && sod(t.dueAt) < today); label = '已逾期' }
    else if (/(本周|这周)/.test(m)) { list = open.filter((t) => t.dueAt && sod(t.dueAt) >= today && sod(t.dueAt) < today + 7 * 86400000); label = '本周到期' }
    else if (/完成/.test(m) && /(已|哪些)/.test(m)) {
      const settings = await repos.settings.get()
      list = visibleFilter(await repos.tasks.all(), settings).filter((t) => t.status === 'done'); label = '已完成'
    }
    const sorted = [...list].sort((a, b) => String(a.dueAt || '9999') < String(b.dueAt || '9999') ? -1 : 1).slice(0, 10)
    const reply = sorted.length === 0
      ? `${label}：暂时没有。${label === '已逾期' ? '很好，没有拖欠。' : ''}`
      : `${label} 共 ${list.length} 条${list.length > 10 ? '（只列前 10 条）' : ''}：\n${listLines(sorted)}`
    return finish(repos, { message, intent, reply })
  }

  if (intent === 'complete' || intent === 'delete') {
    const target = extractCommandTarget(message)
    const open = intent === 'complete' ? await openTasksOf(repos) : await (async () => {
      const settings = await repos.settings.get()
      return visibleFilter(await repos.tasks.all(), settings).filter((t) => t.status !== 'archived')
    })()
    const hits = matchTasks(open, target)
    if (!target || hits.length === 0) {
      return finish(repos, { message, intent, reply: `没有找到标题匹配「${target || message}」的任务。可以先说「有哪些任务」看看清单，或换个更接近任务标题的说法。` })
    }
    if (hits.length > 1) {
      return finish(repos, { message, intent, reply: `找到 ${hits.length} 条相近的任务，说得再具体一点（用完整标题）：\n${listLines(hits.slice(0, 5))}` })
    }
    const t = hits[0]
    if (intent === 'complete') {
      const task = await repos.tasks.update(t.id, { status: 'done' })
      await repos.activity.log(t.id, '通过聊天标记完成')
      if (db) await notifyTaskDoneFx(db, repos, user, t.id)
      return finish(repos, { message, intent, reply: `✅ 已完成「${t.title}」。`, performed: [{ type: 'complete_task', id: t.id, task }] })
    }
    await repos.tasks.remove(t.id)
    return finish(repos, { message, intent, reply: `🗑️ 已删除「${t.title}」。`, performed: [{ type: 'delete_task', id: t.id, title: t.title }] })
  }

  if (intent === 'remember') {
    const note = message.replace(/^记住[:：，,\s]*/, '').trim() || message
    await appendMemory(repos, note)
    let reply = `🧠 已写入长期记忆：「${note.slice(0, 60)}」。之后判断与规划会参考它（可在 Agent 配置 · 记忆 中查看和修改）。`
    const performed = [{ type: 'remember', note: note.slice(0, 80) }]
    // 记忆里的自动化规则："以后合同类的任务都邀请张伟" → 建立自动邀请规则
    if (db) {
      const rule = await maybeCreateAutoRule(db, repos, note, user)
      if (rule) { reply += `\n⚙️ 已建立自动规则：新任务包含「${rule.keyword}」→ 自动邀请 ${rule.targetName} 协作。`; performed.push({ type: 'auto_rule', id: rule.id, keyword: rule.keyword, targetName: rule.targetName }) }
    }
    return finish(repos, { message, intent, reply, performed })
  }

  if (intent === 'question') {
    return finish(repos, {
      message, intent,
      reply: '这更像一个问题，我没有把它记成待办。规则模式下我不擅长开放问答 — 在 设置 · AI 接入 配置真实模型后我可以直接回答；如果它其实是件要做的事，可以说「帮我记：…」。',
    })
  }

  // ---- capture 落库前的三道闸：澄清闭环 → 重复检测 → 多条拆分 ----

  // 1) 澄清闭环：刚有待澄清想法，且本条更像补充说明而非新任务 → 合并转正式任务
  const pending = await findPendingClarify(repos)
  if (pending) {
    if (/^(跳过|算了|不用了?|先不|不转|保持现状)/.test(message.trim())) {
      return finish(repos, { message, intent: 'clarify_skip', reply: `好，「${pending.title}」继续留在待澄清区，想补充时随时说。` })
    }
    // 回答特征：非任务类输入，或带"目标/输出/补充"等澄清用语（答案里常含截止时间，不能只看分类）
    const probe = triageInputSync(message)
    const answerish = probe.kind !== 'task' || /(目标|输出|完成标准|标准是|就是|想要|需要产出|补充|针对|关于这)/.test(message)
    if (answerish) {
      const conv = await convertIdeaToTask(repos, pending.id)
      if (conv) {
        const due = detectDue(message)
        const patch = { notes: `${pending.rawText}\n补充：${message}` }
        if (due) patch.dueAt = due
        const task = await repos.tasks.update(conv.task.id, patch)
        await repos.captureRecords.create({ rawInput: message, source: 'chat', aiKind: 'task', confidence: 0.9, aiReason: '澄清补充后转为正式任务', resultEntityType: 'task', resultEntityId: task.id, status: 'ok' })
        return finish(repos, {
          message, intent: 'clarify_convert',
          reply: `👌 已结合补充信息，把「${pending.title}」转为正式任务${due ? `（截止 ${fmtDue(due)}）` : ''}。`,
          entities: [{ type: 'task', entity: task }],
          performed: [{ type: 'convert_idea', ideaId: pending.id, id: task.id, title: task.title }],
        })
      }
    }
  }

  // 2) 重复检测：与已有任务同名 → 不重复创建；在重复警告后再次发送相同内容才视为强制新建
  const dup = await findDuplicate(repos, message)
  const allMsgs = await repos.chat.all()
  const prevUser = allMsgs.filter((m) => m.role === 'user').slice(-1)[0]
  const lastAgent = allMsgs.filter((m) => m.role === 'agent').slice(-1)[0]
  const forced = !!(prevUser && prevUser.text.trim() === message.trim() && lastAgent && lastAgent.text.includes('和已有任务重复'))
  if (dup && !forced) {
    return finish(repos, { message, intent: 'duplicate', reply: `这条和已有任务重复：「${dup.title}」（${dup.status === 'done' ? '已完成' : '未完成'} · ${fmtDue(dup.dueAt)}）。\n确实要再建一条的话，再发送一次相同内容即可。` })
  }

  // 3) 多条拆分（换行 / 分号 / 编号列表）→ 逐条 triage 归档
  const segments = splitSegments(message)
  const created = []
  for (const seg of segments) {
    const r = await persistCapture(repos, { result: triageInputSync(seg), text: seg, source: 'chat' })
    created.push({ type: r.entityType, entity: r.entity, result: r.result })
  }
  if (created.length > 1) {
    const label = { task: '任务', todo_idea: '待澄清', non_todo: '非 todo' }
    const lines = created.map((e, i) => `${i + 1}. ${e.entity.title}（${label[e.type]}）`).join('\n')
    return finish(repos, { message, intent: 'capture', reply: `已拆成 ${created.length} 条分别归档：\n${lines}`, entities: created })
  }
  const { result } = created[0]
  let reply =
    result.kind === 'task' ? `✅ 已进入 todo 主系统：${result.title}\n${result.reason}`
      : result.kind === 'todo_idea' ? `📥 已进入待澄清区：${result.title}\n建议下一步：${result.suggestedNextAction}\n（直接回复补充目标或时间，我就转成正式任务；回复「跳过」保持现状）`
        : `◽️ 非 todo，已隔离输出：${result.title}\n原因：${result.reason}（未进入 todo 主系统）`

  // @成员 → 对刚创建的任务发出协作邀请；@非好友 → 降级为先发好友请求
  const performed = []
  if (db && created[0].type === 'task') {
    for (const u of await extractMentionedUsers(db, message, user)) {
      if (user && !u.isFriend) {
        const fr = await requestFriendByIdFx(db, user, u.id)
        if (fr.friendship && fr.autoAccepted) reply += `\n🤝 你和 ${u.name} 互相发过好友请求——已直接成为好友，可以再 @ 一次发出协作邀请。`
        else if (fr.friendship || fr.pending) { reply += `\n👋 ${u.name} 还不是你的好友——已自动发送好友请求，对方接受后再 @ 即可邀请协作。`; performed.push({ type: 'friend_request', userId: u.id, userName: u.name }) }
        else if (fr.error) reply += `\n（未能向 ${u.name} 发出好友请求：${fr.error}）`
        continue
      }
      const r = await inviteFx(db, repos, user, created[0].entity.id, u.id)
      if (r.collab) { reply += `\n🤝 已向 ${u.name} 发出协作邀请（待接受）`; performed.push({ type: 'invite', userId: u.id, userName: u.name, collabId: r.collab.id }) }
      else if (r.needConfirm) reply += `\n（未邀请 ${u.name}：${r.error}）`
    }
    // 自动化规则：任务命中关键词 → 自动邀请
    for (const p of await applyAutoInvitesFx(db, repos, user, created[0].entity, message)) {
      reply += `\n⚙️ 按你的规则「${p.rule}」，已自动邀请 ${p.userName} 协作（待接受）`
      performed.push(p)
    }
  }
  return finish(repos, { message, intent: 'capture', reply, entities: created, performed })
}

// One chat turn. Model-driven when an LLM is configured; rule-based otherwise
// (or as a fallback when the LLM call fails and fallbackToRule is on).
// onEvent (optional): streaming hook — {type:'status',intent} early, then {type:'delta',text}…
// db/user (optional): enable cross-user effects (协作邀请/响应) — routes pass them in.
export async function chat(repos, { message, onEvent, db, user }) {
  const aiConfig = await (repos.aiConfig?.get?.() || null)

  // 身份提问：后端按真实配置直接回答，truthful 且不消耗模型额度。
  if (isIdentityQuestion(message)) {
    if (onEvent) onEvent({ type: 'status', intent: 'identity' })
    return finish(repos, { message, intent: 'identity', reply: identityReply(aiConfig) })
  }

  const useLlm = aiConfig && aiConfig.provider !== 'rule' && aiConfig.apiKey
  if (onEvent) onEvent({ type: 'status', intent: useLlm ? 'agent' : detectIntent(message) })

  if (useLlm) {
    try {
      return await agentChat(repos, { message, aiConfig, onEvent, db, user })
    } catch (err) {
      repos.aiErrors.create({ rawInput: message, message: err.message })
      if (aiConfig.fallbackToRule === false) {
        return finish(repos, { message, intent: 'agent', reply: 'AI 处理失败，请点重试。', isError: true })
      }
      // fall through to rule chat
    }
  }
  return ruleChat(repos, { message, db, user })
}
