#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const textExtensions = new Set(['.env', '.example', '.json', '.js', '.mjs', '.ts', '.tsx', '.md', '.sh', '.yaml', '.yml'])
const textBasenames = new Set(['Dockerfile', '.gitignore'])

export function inspectSensitiveContent(content) {
  const findings = []
  if (/AAQ[A-Za-z0-9+/]{80,}={0,2}/.test(content)) findings.push('wechat-cli-secret')
  if (/AKID[A-Za-z0-9]{24,}/.test(content)) findings.push('tencent-cloud-secret-id')
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) findings.push('private-key')
  const assignment = /^(?:export\s+)?[A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|API_KEY|SECRET_KEY)[A-Z0-9_]*\s*=\s*(.+)$/gm
  for (const match of content.matchAll(assignment)) {
    const value = match[1].trim().replace(/^['"]|['"]$/g, '')
    if (value && !/^(?:replace-|<|__|\$\{|example|local-test)/i.test(value) && value.length >= 16) {
      findings.push('literal-secret-assignment')
      break
    }
  }
  return findings
}

function trackedAndUntrackedFiles() {
  const result = spawnSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8'
  })
  if (result.status !== 0) throw new Error('GIT_FILE_LIST_UNAVAILABLE')
  return result.stdout.split('\0').filter(Boolean)
}

async function main() {
  const findings = []
  for (const relativePath of trackedAndUntrackedFiles()) {
    const basename = relativePath.split('/').at(-1)
    if (!textExtensions.has(extname(relativePath)) && !textBasenames.has(basename)) continue
    let content
    try {
      content = readFileSync(resolve(root, relativePath), 'utf8')
    } catch {
      continue
    }
    const kinds = inspectSensitiveContent(content)
    if (kinds.length) findings.push({ path: relativePath, kinds })
  }
  if (findings.length) {
    for (const finding of findings) console.error(`sensitive artifact detected: ${finding.path} (${finding.kinds.join(',')})`)
    process.exitCode = 1
    return
  }
  console.log('sensitive artifact scan passed')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
