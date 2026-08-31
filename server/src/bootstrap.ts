import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { hashPassword } from './auth.js'

/**
 * 一键部署的前提是「不给任何环境变量也能安全启动」。
 * 密钥和初始密码因此落在数据卷里而不是现生成：容器重建后 token 不失效、密码不变。
 */

const SECRET_FILE = 'jwt-secret'
const PASSWORD_FILE = 'password-hash'

// 去掉 0/O/1/l/I，初始密码要能从日志里照着念出来
const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function dataDirOf(dbPath: string) {
  return dirname(dbPath) || '.'
}

function readOrCreate(dir: string, name: string, create: () => string) {
  const file = join(dir, name)
  if (existsSync(file)) {
    const value = readFileSync(file, 'utf8').trim()
    if (value) return { value, created: false }
  }
  const value = create()
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, `${value}\n`, 'utf8')
  try {
    chmodSync(file, 0o600)
  } catch {
    // Windows 与部分绑定挂载不支持 chmod，不影响功能
  }
  return { value, created: true }
}

export function resolveJwtSecret(dataDir: string) {
  const fromEnv = process.env.JWT_SECRET?.trim()
  if (fromEnv && fromEnv !== 'change-me' && fromEnv !== 'dev-only-change-me') {
    return { secret: fromEnv, source: 'env' as const }
  }
  const { value, created } = readOrCreate(dataDir, SECRET_FILE, () => randomBytes(48).toString('hex'))
  return { secret: value, source: created ? ('generated' as const) : ('persisted' as const) }
}

function randomPassword(length = 16) {
  const bytes = randomBytes(length)
  let out = ''
  for (const byte of bytes) out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]
  return out
}

export interface ResolvedCredentials {
  hash: string
  source: 'env-hash' | 'env-password' | 'persisted' | 'generated'
  generatedPassword?: string
}

export function resolveCredentials(dataDir: string): ResolvedCredentials {
  const envHash = process.env.FOCUSDECK_PASSWORD_HASH?.trim()
  if (envHash) return { hash: envHash, source: 'env-hash' }

  const envPassword = process.env.FOCUSDECK_PASSWORD?.trim()
  if (envPassword) return { hash: hashPassword(envPassword), source: 'env-password' }

  let generated: string | undefined
  const { value, created } = readOrCreate(dataDir, PASSWORD_FILE, () => {
    generated = randomPassword()
    return hashPassword(generated)
  })
  return created
    ? { hash: value, source: 'generated', generatedPassword: generated }
    : { hash: value, source: 'persisted' }
}

export function printStartupBanner(options: {
  username: string
  credentials: ResolvedCredentials
  secretSource: string
  staticDir: string | null
  url: string
}) {
  const { username, credentials, secretSource, staticDir, url } = options
  const lines = [
    '',
    '  FocusDeck 服务端已启动',
    `  地址      ${url}`,
    `  前端      ${staticDir ? `内置静态站点（${staticDir}）` : '未内置，仅提供 /api'}`,
    `  JWT 密钥  ${secretSource === 'env' ? '来自环境变量' : secretSource === 'generated' ? '已生成并写入数据目录' : '读自数据目录'}`,
    `  账号      ${username}`,
  ]

  if (credentials.generatedPassword) {
    lines.push(
      '',
      '  ── 首次启动，已生成初始密码，只在本次日志显示一次 ──',
      `  密码      ${credentials.generatedPassword}`,
      '  改密码：设置 FOCUSDECK_PASSWORD 后重启，或删除数据目录下的 password-hash 重新生成',
    )
  } else if (credentials.source === 'persisted') {
    lines.push('  密码      沿用数据目录中已保存的凭据')
  }

  lines.push('')
  console.log(lines.join('\n'))
}
