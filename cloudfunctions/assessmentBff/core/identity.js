const { createHmac } = require('node:crypto')

function deriveSubjectId(openid, secret) {
  if (!openid) throw new Error('WECHAT_IDENTITY_REQUIRED')
  if (!secret) throw new Error('SUBJECT_ID_HMAC_SECRET_REQUIRED')
  return `sub_${createHmac('sha256', secret).update(openid).digest('hex').slice(0, 32)}`
}

module.exports = { deriveSubjectId }
