import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeAuthApp, befriend } from './helpers.js'
import { stripInviteClaims } from '../src/services/collab.js'

// 唯一邮箱：auth 限流器是进程级共享的（同一 IP+邮箱 10 次/10 分钟），
// 本文件测试多、复用同邮箱会触发 429，故每次注册用不同邮箱。
let _emailSeq = 0
const reg = (app, name, email) =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload: { name, email: email.replace('@', `${++_emailSeq}@`), password: 'pass1234' } }).then((r) => r.json())
const H = (t) => ({ authorization: `Bearer ${t}` })
const say = (app, token, message, mentions) =>
  app.inject({ method: 'POST', url: '/api/chat', headers: H(token), payload: mentions ? { message, mentions } : { message } }).then((r) => r.json())

// ---- 纯函数：剥离 LLM 的"已邀请"断言，保留其它内容 ----
test('stripInviteClaims removes only the invite-claim clause, keeps the rest', () => {
  const out = stripInviteClaims('好的，已为你创建明天10点的吃饭任务，并已邀请 liubai 协作。')
  assert.ok(!out.includes('已邀请'))
  assert.ok(out.includes('吃饭任务'))
})
test('stripInviteClaims drops a whole claim line', () => {
  const out = stripInviteClaims('任务已创建。\n已通知张三参与协作。')
  assert.ok(out.includes('任务已创建'))
  assert.ok(!out.includes('已通知'))
})
test('stripInviteClaims leaves non-claim text untouched', () => {
  const s = '已把任务改到九点。'
  assert.equal(stripInviteClaims(s), s)
})

// ---- 规则链路：@未知成员 —— 复现截图 Bug，验证不再自相矛盾 ----
test('rule: "@liubai 明天10点吃饭" → task with due tomorrow 10:00, honest "无法邀请", no contradiction', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  const res = await say(app, a.token, '@liubai 明天10点吃饭')
  assert.equal(res.entities[0].type, 'task')
  // 时间识别保留：明天 10 点写入截止
  const due = new Date(res.entities[0].entity.dueAt)
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  assert.equal(due.getMonth(), tomorrow.getMonth())
  assert.equal(due.getDate(), tomorrow.getDate())
  assert.equal(due.getHours(), 10)
  // 口径一致：说"没找到成员"，且没有任何"已邀请/未实际发出"的矛盾表述
  assert.ok(res.reply.includes('没找到成员'))
  assert.ok(!res.reply.includes('已邀请'))
  assert.ok(!res.reply.includes('没有实际发出'))
  assert.ok(!res.performed.some((p) => p.type === 'invite'))
})

// ---- 规则链路：@好友 / @非好友 / 多成员混合 ----
test('rule: @friend invites, @non-friend degrades to friend request, @unknown reported — all in one', async () => {
  const { app, db } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  const b = await reg(app, '博文', 'b@x.com')   // 好友
  await reg(app, '晨曦', 'c@x.com')             // 非好友
  await befriend(db, a.user.id, b.user.id)

  const res = await say(app, a.token, '周五下午三点和 @博文 @晨曦 @赵六 一起对合同')
  assert.equal(res.entities[0].type, 'task')
  // 博文：好友 → 真实邀请
  assert.ok(res.performed.some((p) => p.type === 'invite' && p.userName === '博文'))
  assert.ok(res.reply.includes('已向 博文 发出协作邀请'))
  // 晨曦：非好友 → 好友请求
  assert.ok(res.performed.some((p) => p.type === 'friend_request' && p.userName === '晨曦'))
  assert.ok(res.reply.includes('晨曦 还不是你的好友'))
  // 赵六：未知 → 明确告知
  assert.ok(res.reply.includes('没找到成员「赵六」'))
})

// ---- 结构化 person mention（前端选择器）优先，不依赖名字模糊匹配 ----
test('structured person mention invites by userId even if name not typed literally', async () => {
  const { app, db } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  const b = await reg(app, '博文', 'b@x.com')
  await befriend(db, a.user.id, b.user.id)
  const res = await say(app, a.token, '明天上午十点开评审会', [{ type: 'person', userId: b.user.id, label: '博文' }])
  assert.equal(res.entities[0].type, 'task')
  assert.ok(res.performed.some((p) => p.type === 'invite' && p.userName === '博文'))
  assert.ok(res.reply.includes('已向 博文 发出协作邀请'))
})

// ---- Agent 链路（LLM 桩）：精确复现截图矛盾并验证已消除 ----
function stubLlm(obj) {
  const orig = global.fetch
  global.fetch = async () => ({ ok: true, status: 200, async json() { return { choices: [{ message: { content: JSON.stringify(obj) } }] } }, async text() { return '' } })
  return () => { global.fetch = orig }
}

test('agent: LLM claims "已邀请" for unknown @member → claim stripped, honest status, no contradiction', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  await app.inject({ method: 'PUT', url: '/api/ai/config', headers: H(a.token), payload: { provider: 'openai', baseUrl: 'https://llm.example.com/v1', model: 'm', apiKey: 'k' } })
  const tomorrow10 = (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d.toISOString() })()
  const restore = stubLlm({ reply: '好的，已为你创建明天10点的吃饭任务，并已邀请 liubai 协作。', actions: [{ type: 'create_task', title: '和 liubai 吃饭', dueAt: tomorrow10, priority: 3 }] })
  try {
    const res = await say(app, a.token, '@liubai 明天10点吃饭')
    assert.equal(res.entities[0].type, 'task')
    assert.ok(!res.reply.includes('已邀请'), 'false invite claim must be stripped')
    assert.ok(!res.reply.includes('没有实际发出'), 'no leftover contradiction note')
    assert.ok(res.reply.includes('没找到成员「liubai」'))
    assert.ok(res.reply.includes('吃饭任务'), 'task confirmation preserved')
  } finally { restore() }
})

test('structured time mention fills due when the task action left it empty', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  await app.inject({ method: 'PUT', url: '/api/ai/config', headers: H(a.token), payload: { provider: 'openai', baseUrl: 'https://llm.example.com/v1', model: 'm', apiKey: 'k' } })
  const iso = (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(15, 0, 0, 0); return d.toISOString() })()
  const restore = stubLlm({ reply: '好的，已安排。', actions: [{ type: 'create_task', title: '团队评审会' }] })
  try {
    const res = await say(app, a.token, '安排一次团队评审会', [{ type: 'time', iso, label: '明天 15:00' }])
    assert.equal(res.entities[0].type, 'task')
    assert.equal(res.entities[0].entity.dueAt, iso)
  } finally { restore() }
})

test('doc mention is accepted and does not trigger collaboration', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  const res = await say(app, a.token, '整理下季度计划提纲', [{ type: 'doc', entityType: 'task', id: 'task_x', label: '季度计划' }])
  assert.ok(res.entities.length >= 1)
  assert.ok(!res.performed.some((p) => p.type === 'invite' || p.type === 'friend_request'))
})

test('agent: LLM claims invite for a real friend → reply reflects actual invite + assignee set', async () => {
  const { app, db } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  const b = await reg(app, '博文', 'b@x.com')
  await befriend(db, a.user.id, b.user.id)
  await app.inject({ method: 'PUT', url: '/api/ai/config', headers: H(a.token), payload: { provider: 'openai', baseUrl: 'https://llm.example.com/v1', model: 'm', apiKey: 'k' } })
  const restore = stubLlm({ reply: '好的，已创建任务并邀请了博文。', actions: [{ type: 'create_task', title: '对一遍合同', priority: 2 }, { type: 'invite_collaborator', userName: '博文' }] })
  try {
    const res = await say(app, a.token, '和 @博文 对一遍合同')
    assert.ok(res.performed.some((p) => p.type === 'invite' && p.userName === '博文'))
    assert.ok(res.reply.includes('已向 博文 发出协作邀请'))
    // 匹配成功 → 成员被写为任务责任人（assignee）
    assert.equal(res.entities[0].entity.assignee, '博文')
    // 原始 LLM 的"邀请了博文"含糊措辞已被剥离，只剩一条权威口径
    assert.ok(!res.reply.includes('邀请了博文'))
    assert.equal((res.reply.match(/已向 博文 发出协作邀请/g) || []).length, 1)
  } finally { restore() }
})

// 对任意 LLM 措辞都健壮：多种"邀请"表达 + 未知成员 → 一律被剥离，无矛盾
for (const phrasing of [
  '好的，已把 liubai 加入协作，任务已创建。',
  '任务已创建。liubai 会一起参与这次吃饭。',
  '已创建吃饭任务，并通知了 liubai。',
  '已创建任务，已将 liubai 设为参与人。',
]) {
  test(`agent: unknown-member invite claim stripped regardless of phrasing — ${phrasing.slice(0, 12)}…`, async () => {
    const { app } = await makeAuthApp()
    const a = await reg(app, '安娜', 'a@x.com')
    await app.inject({ method: 'PUT', url: '/api/ai/config', headers: H(a.token), payload: { provider: 'openai', baseUrl: 'https://llm.example.com/v1', model: 'm', apiKey: 'k' } })
    const iso = (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d.toISOString() })()
    const restore = stubLlm({ reply: phrasing, actions: [{ type: 'create_task', title: '和 liubai 吃饭', dueAt: iso, priority: 3 }] })
    try {
      const res = await say(app, a.token, '@liubai 明天10点吃饭')
      assert.equal(res.entities[0].type, 'task')
      assert.ok(res.reply.includes('没找到成员「liubai」'))
      // 没有任何"已邀请/已通知/加入协作/参与"的残留断言
      assert.ok(!/(已把 ?liubai|通知了 ?liubai|liubai 会一起|设为参与人)/.test(res.reply), 'claim about liubai must be stripped')
      assert.ok(!res.reply.includes('没有实际发出'))
    } finally { restore() }
  })
}

test('agent: multiple @members — one friend invited (assignee), one non-friend degraded, one unknown reported', async () => {
  const { app, db } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  const b = await reg(app, '博文', 'b@x.com') // 好友
  await reg(app, '晨曦', 'c@x.com')           // 非好友
  await befriend(db, a.user.id, b.user.id)
  await app.inject({ method: 'PUT', url: '/api/ai/config', headers: H(a.token), payload: { provider: 'openai', baseUrl: 'https://llm.example.com/v1', model: 'm', apiKey: 'k' } })
  const restore = stubLlm({ reply: '好的，已创建评审任务，已邀请博文、晨曦和赵六一起参与。', actions: [{ type: 'create_task', title: '方案评审', priority: 2 }] })
  try {
    const res = await say(app, a.token, '和 @博文 @晨曦 @赵六 一起做方案评审')
    assert.ok(res.performed.some((p) => p.type === 'invite' && p.userName === '博文'))
    assert.equal(res.entities[0].entity.assignee, '博文')
    assert.ok(res.reply.includes('已向 博文 发出协作邀请'))
    assert.ok(res.reply.includes('晨曦 还不是你的好友'))
    assert.ok(res.reply.includes('没找到成员「赵六」'))
    // 三种口径互斥、不与 LLM 原话矛盾
    assert.ok(!res.reply.includes('已邀请博文、晨曦和赵六'))
  } finally { restore() }
})
