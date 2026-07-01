import { buildApp } from './app.js'
import { config } from './config.js'

const app = buildApp()

app
  .listen({ port: config.port, host: config.host })
  .then((addr) => app.log.info(`chattodo-server listening on ${addr}`))
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
