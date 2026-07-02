export default async function authRoutes(app) {
  const { auth } = app

  app.post('/api/auth/register', async (req, reply) => {
    const { name, email, password } = req.body || {}
    if (!name || !String(name).trim()) return reply.status(400).send({ error: '请输入显示名称' })
    if (!email || !/.+@.+\..+/.test(String(email))) return reply.status(400).send({ error: '邮箱格式不正确' })
    if (!password || String(password).length < 6) return reply.status(400).send({ error: '密码至少 6 位' })
    if (auth.findByEmail(email)) return reply.status(409).send({ error: '该邮箱已注册，请直接登录' })
    const user = auth.register({ name: String(name).trim(), email, password: String(password) })
    return { token: auth.createSession(user.id), user }
  })

  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body || {}
    const user = auth.verifyLogin(email, password)
    if (!user) return reply.status(401).send({ error: '邮箱或密码不正确' })
    return { token: auth.createSession(user.id), user }
  })

  app.post('/api/auth/logout', async (req) => {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')
    if (m) auth.logout(m[1])
    return { ok: true }
  })

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'unauthorized' })
    return req.user
  })

  app.patch('/api/auth/me', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'unauthorized' })
    const { name } = req.body || {}
    if (name && String(name).trim()) return auth.updateName(req.user.id, String(name).trim())
    return req.user
  })

  app.post('/api/auth/password', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'unauthorized' })
    const { oldPassword, newPassword } = req.body || {}
    if (!newPassword || String(newPassword).length < 6) return reply.status(400).send({ error: '新密码至少 6 位' })
    if (!auth.changePassword(req.user.id, oldPassword, String(newPassword))) {
      return reply.status(400).send({ error: '当前密码不正确' })
    }
    return { ok: true }
  })
}
