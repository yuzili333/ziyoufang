const fs = require('node:fs')
const mysql = require('mysql2/promise')

function createPool(config) {
  const ssl = config.sslMode === 'DISABLED' ? undefined : {
    ca: fs.readFileSync(config.sslCaFile, 'utf8'),
    rejectUnauthorized: config.sslMode === 'VERIFY_IDENTITY'
  }
  return mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionLimit: config.connectionLimit,
    charset: 'utf8mb4',
    timezone: 'Z',
    supportBigNumbers: true,
    ssl
  })
}

const toMysqlDate = (value) => value ? new Date(value).toISOString().slice(0, 23).replace('T', ' ') : null

module.exports = { createPool, toMysqlDate }
