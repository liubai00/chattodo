import { loadConfig } from '@linx/platform-config'
import { baseLogger } from '@linx/platform-logger'
import { buildServer } from './server.js'

const config = loadConfig()

async function main(): Promise<void> {
  const app = await buildServer()
  await app.listen({ port: config.port, host: config.host })
  baseLogger.info({ port: config.port, host: config.host }, '[linx-api] listening')

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      baseLogger.info({ sig }, '[linx-api] shutting down')
      void app.close().then(() => process.exit(0))
    })
  }
}

main().catch((err: unknown) => {
  baseLogger.error({ err }, '[linx-api] failed to start')
  process.exit(1)
})
