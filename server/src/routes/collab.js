import { inviteFx, respondInviteFx } from '../services/collab.js'

// 任务协作（邀请-确认制）：
//   POST /api/tasks/:id/invite {userId, force?}      — owner 发出邀请
//   GET  /api/invites                                — 我的待处理邀请
//   POST /api/invites/:id/respond {accept, remind?}  — 被邀请人响应
//   POST /api/tasks/:id/leave                        — 协作者退出
export default async function collabRoutes(app) {
  app.post('/api/tasks/:id/invite', async (req, reply) => {
    const r = await inviteFx(app.db, req.repos, req.user, req.params.id, String((req.body && req.body.userId) || ''), { force: !!(req.body && req.body.force) })
    if (r.error) return reply.status(r.needConfirm ? 409 : r.cooldown ? 429 : r.bad ? 400 : 404).send({ error: r.error, needConfirm: !!r.needConfirm })
    return r
  })

  app.get('/api/invites', async (req) => ({ invites: await req.repos.collaborators.myPending() }))

  app.post('/api/invites/:id/respond', async (req, reply) => {
    const b = req.body || {}
    const mode = b.follow ? 'follow' : b.accept ? 'accept' : 'decline'
    const remind = 'remind' in b ? !!b.remind : true
    const r = await respondInviteFx(app.db, req.repos, req.user, req.params.id, mode, remind)
    if (!r) return reply.status(404).send({ error: '邀请不存在或已处理' })
    return r
  })

  // 自动化规则管理（记忆驱动的自动邀请）
  app.get('/api/auto-rules', async (req) => ({ rules: await req.repos.autoRules.all() }))
  app.delete('/api/auto-rules/:id', async (req) => { await req.repos.autoRules.remove(req.params.id); return { ok: true } })

  app.post('/api/tasks/:id/leave', async (req, reply) => {
    const repos = req.repos
    const task = await repos.tasks.get(req.params.id)
    if (!task) return reply.status(404).send({ error: 'task not found' })
    if (!(await repos.collaborators.leave(req.params.id))) return reply.status(400).send({ error: '你不是该任务的协作者' })
    const meName = (req.user && req.user.name) || '协作者'
    const owner = await app.db.get(`SELECT user_id FROM tasks WHERE id = ?`, [req.params.id])
    await app.db.run(`INSERT INTO notifications (id,user_id,type,icon,color,text,read,created_at) VALUES (?,?,?,?,?,?,0,?)`,
      ['nt_' + Math.random().toString(36).slice(2, 10), owner.user_id, 'assign', 'ph-sign-out', 'var(--text3)', `${meName} 退出了「${task.title}」的协作`, new Date().toISOString()])
    return { ok: true }
  })
}
