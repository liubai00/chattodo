import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import { getDb } from './db/index.js'
import { makeRepos } from './repositories/index.js'
import { makeAuth } from './services/auth.js'
import healthRoutes from './routes/health.js'
import authRoutes from './routes/auth.js'
import stateRoutes from './routes/state.js'
import captureRoutes from './routes/capture.js'
import taskRoutes from './routes/tasks.js'
import ideaRoutes from './routes/ideas.js'
import nonTodoRoutes from './routes/nonTodos.js'
import planRoutes from './routes/plan.js'
import chatRoutes from './routes/chat.js'
import agentRoutes from './routes/agent.js'
import settingsRoutes from './routes/settings.js'
import searchRoutes from './routes/search.js'
import aiRoutes from './routes/ai.js'
import notificationRoutes from './routes/notifications.js'
import dataRoutes from './routes/data.js'
import adminRoutes from './routes/admin.js'
import projectRoutes from './routes/projects.js'
import teamRoutes from './routes/team.js'
import collabRoutes from './routes/collab.js'
import eventRoutes from './routes/events.js'

// Build a Fastify instance. opts.db lets tests inject an isolated in-memory DB;
// opts.auth === false disables the 401 guard (requests fall back to the
// default user) — used by unit tests. Production keeps auth on.
export function buildApp(opts = {}) {
  // trustProxy：生产在 nginx 之后，req.ip 需取 X-Forwarded-For 才能按真实来源限流。
  const app = Fastify({ logger: opts.logger ?? true, trustProxy: true })

  const db = opts.db || getDb()
  const defaultRepos = makeRepos(db, opts.userId || config.defaultUserId)
  const auth = makeAuth(db)
  const reposCache = new Map()
  const reposFor = (userId) => {
    if (!reposCache.has(userId)) reposCache.set(userId, makeRepos(db, userId))
    return reposCache.get(userId)
  }
  app.decorate('db', db)
  app.decorate('repos', defaultRepos)
  app.decorate('auth', auth)
  app.decorateRequest('user', null)
  app.decorateRequest('repos', null)

  const requireAuth = opts.auth !== false

  // CORS 来源：默认反射任意来源（同源部署下无实际暴露面）；CORS_ORIGIN 可收紧。
  const co = config.corsOrigin
  const corsOrigin = co === '' ? true : co === 'false' ? false : co === '*' ? true : co.includes(',') ? co.split(',').map((s) => s.trim()) : co
  app.register(cors, { origin: corsOrigin })

  // Tolerate empty JSON bodies (action endpoints like /done, /move-out are
  // often POSTed with no body but a JSON content-type by browsers).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || body.trim() === '') return done(null, {})
    try {
      done(null, JSON.parse(body))
    } catch (err) {
      err.statusCode = 400
      done(err)
    }
  })

  // Resolve the session token → per-user repos. Auth-open paths: health + auth.
  app.addHook('preHandler', async (req, reply) => {
    const url = req.url || ''
    if (!url.startsWith('/api')) return
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')
    const user = m ? auth.resolve(m[1]) : null
    if (user) {
      req.user = user
      req.repos = reposFor(user.id)
      return
    }
    req.repos = defaultRepos
    const open = url.startsWith('/api/health') || url.startsWith('/api/auth')
    if (!open && requireAuth) {
      return reply.status(401).send({ error: 'unauthorized' })
    }
  })

  app.register(healthRoutes)
  app.register(authRoutes)
  app.register(stateRoutes)
  app.register(captureRoutes)
  app.register(taskRoutes)
  app.register(ideaRoutes)
  app.register(nonTodoRoutes)
  app.register(planRoutes)
  app.register(chatRoutes)
  app.register(agentRoutes)
  app.register(settingsRoutes)
  app.register(searchRoutes)
  app.register(aiRoutes)
  app.register(notificationRoutes)
  app.register(dataRoutes)
  app.register(adminRoutes)
  app.register(projectRoutes)
  app.register(teamRoutes)
  app.register(collabRoutes)
  app.register(eventRoutes)

  app.setErrorHandler((err, req, reply) => {
    req.log.error(err)
    reply.status(err.statusCode || 500).send({ error: err.message || 'Internal Server Error' })
  })

  return app
}
