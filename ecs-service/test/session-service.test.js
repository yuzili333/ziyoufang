const assert = require('node:assert/strict')
const test = require('node:test')
const { SessionService } = require('../src/session-service')

function fakePool(now) {
  const rows = new Map()
  return {
    rows,
    async execute(sql, params) {
      if (sql.startsWith('INSERT INTO auth_sessions')) {
        rows.set(params[0], { subject_id: params[1], expires_at: params[2] })
        return [{ affectedRows: 1 }]
      }
      if (sql.startsWith('SELECT subject_id')) {
        const row = rows.get(params[0])
        return [[row && Date.parse(`${row.expires_at.replace(' ', 'T')}Z`) > now() ? row : undefined].filter(Boolean)]
      }
      if (sql.startsWith('UPDATE auth_sessions')) return [{ affectedRows: rows.has(params[0]) ? 1 : 0 }]
      if (sql.startsWith('DELETE FROM auth_sessions')) return [{ affectedRows: 0 }]
      throw new Error(`unexpected sql: ${sql}`)
    }
  }
}

test('sessions expose a random token but persist only its peppered hash', async () => {
  const clock = { value: Date.parse('2026-08-12T10:00:00.000Z') }
  const pool = fakePool(() => clock.value)
  const sessions = new SessionService({ pool, pepper: 'session-pepper', now: () => clock.value })
  const issued = await sessions.issue('subject-1')
  assert.ok(issued.token.length >= 43)
  assert.equal([...pool.rows.keys()].includes(issued.token), false)
  assert.equal((await sessions.resolve(issued.token)).subjectId, 'subject-1')
  clock.value += 2 * 60 * 60 * 1000 + 1
  assert.equal(await sessions.resolve(issued.token), null)
})
