const { createServer } = require('node:http')
const { createApiApp } = require('./api')
const { bootstrap } = require('./bootstrap')

async function main() {
  const dependencies = bootstrap()
  const server = createServer(createApiApp(dependencies))
  server.listen(dependencies.config.port, '0.0.0.0', () => {
    console.log(`ecs api listening on ${dependencies.config.port}`)
  })
  const shutdown = () => server.close(async () => {
    await dependencies.pool.end()
    process.exit(0)
  })
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1) })
