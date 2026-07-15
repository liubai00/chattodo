import { buildServer } from './server.js'

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '127.0.0.1'

async function main(): Promise<void> {
  const app = await buildServer()
  await app.listen({ port: PORT, host: HOST })
  console.log(`[linx-api] listening on http://${HOST}:${PORT}`)

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      void app.close().then(() => process.exit(0))
    })
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
