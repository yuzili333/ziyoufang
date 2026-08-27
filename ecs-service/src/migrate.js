const fs = require('node:fs/promises')
const path = require('node:path')
const { loadConfig } = require('./config')
const { createPool } = require('./mysql')

async function migrate({ pool, directory }) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(128) PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
  const files = (await fs.readdir(directory)).filter((name) => name.endsWith('.sql')).sort()
  for (const file of files) {
    const [rows] = await pool.execute('SELECT version FROM schema_migrations WHERE version=?', [file])
    if (rows.length) continue
    const sql = await fs.readFile(path.join(directory, file), 'utf8')
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      for (const statement of sql.split(';').map((value) => value.trim()).filter(Boolean)) {
        await connection.query(statement)
      }
      await connection.execute('INSERT INTO schema_migrations(version) VALUES (?)', [file])
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }
}

async function main() {
  const config = loadConfig()
  const pool = createPool(config.mysql)
  try { await migrate({ pool, directory: config.migrationDir }) } finally { await pool.end() }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1 })

module.exports = { migrate }
