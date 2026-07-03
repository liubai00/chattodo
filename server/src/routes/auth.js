// 内存滑动窗口限流：同一 IP+邮箱 10 分钟内最多 10 次登录/注册尝试（防爆破）。
const attempts = new Map()
const RL_MAX = 10
const RL_WINDOW = 10 * 60 * 1000
function rateLimited(key) {
  const now = Date.now()
  const arr = (attempts.get(key) || []).filter((t) => now - t < RL_WINDOW)
  arr.push(now)
  attempts.set(key, arr)
  if (attempts.size > 5000) { // 防内存膨胀：偶发全量清理过期项
    for (const [k, v] of attempts) { const alive = v.filter((t) => now - t < RL_WINDOW); if (alive.length) attempts.set(k, alive); else attempts.delete(k) }
  }
  return arr.length > RL_MAX
}

export default async function authRoutes(app) {
  const { auth } = app

  app.post('/api/auth/register', async (req, reply) => {
    const { name, email, password } = req.body || {}
    if (rateLimited(`reg:${req.ip}:${String(email || '').toLowerCase()}`)) return reply.status(429).send({ error: '尝试过于频繁，请 10 分钟后再试' })
    const cleanName = String(name || '').trim()
    if (!cleanName) return reply.status(400).send({ error: '请输入显示名称' })
    if (cleanName.length > 24) return reply.status(400).send({ error: '显示名称最长 24 字' })
    if (!email || !/.+@.+\..+/.test(String(email))) return reply.status(400).send({ error: '邮箱格式不正确' })
    if (!password || String(password).length < 8) return reply.status(400).send({ error: '密码至少 8 位' })
    if (await auth.findByEmail(email)) return reply.status(409).send({ error: '该邮箱已注册，请直接登录' })
    const user = await auth.register({ name: cleanName, email, password: String(password) })
    return { token: await auth.createSession(user.id), user }
  })

  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body || {}
    if (rateLimited(`login:${req.ip}:${String(email || '').toLowerCase()}`)) return reply.status(429).send({ error: '尝试过于频繁，请 10 分钟后再试' })
    const user = await auth.verifyLogin(email, password)
    if (!user) return reply.status(401).send({ error: '邮箱或密码不正确' })
    return { token: await auth.createSession(user.id), user }
  })

  app.post('/api/auth/logout', async (req) => {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')
    if (m) await auth.logout(m[1])
    return { ok: true }
  })

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'unauthorized' })
    return req.user
  })

  app.patch('/api/auth/me', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'unauthorized' })
    const name = String((req.body && req.body.name) || '').trim()
    if (name.length > 24) return reply.status(400).send({ error: '显示名称最长 24 字' })
    if (name) return auth.updateName(req.user.id, name)
    return req.user
  })

  app.post('/api/auth/password', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'unauthorized' })
    const { oldPassword, newPassword } = req.body || {}
    if (!newPassword || String(newPassword).length < 8) return reply.status(400).send({ error: '新密码至少 8 位' })
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')
    if (!(await auth.changePassword(req.user.id, oldPassword, String(newPassword), m ? m[1] : null))) {
      return reply.status(400).send({ error: '当前密码不正确' })
    }
    return { ok: true } // 其他设备的会话已全部吊销
  })
}
