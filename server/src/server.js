import { buildApp } from './app.js'
import { config } from './config.js'
import { initEvents, eventsMode, closeEvents } from './services/events.js'
import { getDriver } from './db/driver.js'

const app = await buildApp()

// 实时事件总线：有 REDIS_URL 用 Redis pub/sub（多实例可扩展），否则进程内模式。
await initEvents({ redisUrl: config.redisUrl, logger: app.log })
app.log.info(`events bus mode: ${eventsMode()}`)

// 优雅关闭：PGlite 的 NodeFS 持久化需要在进程退出前 syncToFs 落盘，
// 否则被强杀（Windows 上 kill/SIGTERM 经由 npm 包装层常退化为终止）
// 会留下半写入的数据目录，下次启动 _pg_initdb 直接 Aborted()。
// 因此收到 SIGINT/SIGTERM 时：停接收 -> 关事件总线 -> 关 DB 落盘 -> 退出。
let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info(`received ${signal}, shutting down...`)
  try {
    await app.close()       // 停止监听 + 排空在途请求
    await closeEvents()     // 断开 Redis/进程内订阅
    const db = await getDriver()
    await db.close?.()      // PGlite syncToFs / pg pool end
  } catch (e) {
    app.log.error({ err: e }, 'error during shutdown')
  }
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

app
  .listen({ port: config.port, host: config.host })
  .then((addr) => app.log.info(`chattodo-server listening on ${addr}`))
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
