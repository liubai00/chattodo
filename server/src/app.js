import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import { getDb } from './db/index.js'
import { makeRepos } from './repositories/index.js'
import healthRoutes from './routes/health.js'
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

// Build a Fastify instance. opts.db lets tests inject an isolated in-memory DB.
export function buildApp(opts = {}) {
  const app = Fastify({ logger: opts.logger ?? true })

  const db = opts.db || getDb()
  const repos = makeRepos(db, opts.userId || config.defaultUserId)
  app.decorate('db', db)
  app.decorate('repos', repos)

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

  app.register(cors, { origin: true })

  app.register(healthRoutes)
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

  app.setErrorHandler((err, req, reply) => {
    req.log.error(err)
    reply.status(err.statusCode || 500).send({ error: err.message || 'Internal Server Error' })
  })

  return app
}
