import { buildApp } from './app.js'
import { config } from './config.js'
import { initEvents, eventsMode } from './services/events.js'

const app = buildApp()

// 实时事件总线：有 REDIS_URL 用 Redis pub/sub（多实例可扩展），否则进程内模式。
await initEvents({ redisUrl: config.redisUrl, logger: app.log })
app.log.info(`events bus mode: ${eventsMode()}`)

app
  .listen({ port: config.port, host: config.host })
  .then((addr) => app.log.info(`chattodo-server listening on ${addr}`))
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
