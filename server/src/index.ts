import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { COLLECTIONS, emptyCollections, openDb, pruneTombstones, pullSince, upsertRecords, type CollectionName, type StoredRecord } from './db.js'
import { signToken, TOKEN_TTL_SECONDS, verifyPassword, verifyToken } from './auth.js'
import { dataDirOf, printStartupBanner, resolveCredentials, resolveJwtSecret } from './bootstrap.js'

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '0.0.0.0'
const DB_PATH = process.env.DB_PATH ?? './data/focusdeck.db'
const USERNAME = process.env.FOCUSDECK_USER ?? 'focus'
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

const DATA_DIR = dataDirOf(DB_PATH)
mkdirSync(DATA_DIR, { recursive: true })

const credentials = resolveCredentials(DATA_DIR)
const PASSWORD_HASH = credentials.hash
const { secret: JWT_SECRET, source: secretSource } = resolveJwtSecret(DATA_DIR)

const db = openDb(DB_PATH)
pruneTombstones(db, Date.now() - TOMBSTONE_TTL_MS)

const app = new Hono()

app.use('/api/*', cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://localhost',
    'capacitor://localhost',
    'http://localhost',
    'tauri://localhost',
    'https://tauri.localhost',
  ],
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}))

app.get('/api/health', (c) => c.json({ ok: true }))
app.get('/api/time', (c) => c.json({ serverNow: Date.now() }))

app.post('/api/auth/login', async (c) => {
  if (!PASSWORD_HASH) throw new HTTPException(500, { message: 'server password is not configured' })
  const body = await c.req.json().catch(() => ({})) as { username?: string; password?: string }
  const username = String(body.username ?? '')
  const password = String(body.password ?? '')
  if (username !== USERNAME || !verifyPassword(password, PASSWORD_HASH)) {
    throw new HTTPException(401, { message: 'invalid credentials' })
  }
  const token = await signToken(username, JWT_SECRET)
  return c.json({ token, expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000, username })
})

async function requireUser(c: { req: { header: (name: string) => string | undefined } }) {
  const header = c.req.header('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new HTTPException(401, { message: 'missing token' })
  try {
    const username = await verifyToken(token, JWT_SECRET)
    if (!username) throw new Error('empty subject')
    return username
  } catch {
    throw new HTTPException(401, { message: 'invalid token' })
  }
}

app.get('/api/auth/me', async (c) => {
  const username = await requireUser(c)
  return c.json({ username })
})

app.get('/api/sync', async (c) => {
  await requireUser(c)
  const since = Number(c.req.query('since') ?? 0) || 0
  const changes = pullSince(db, since)
  return c.json({ since, serverNow: Date.now(), changes })
})

app.post('/api/sync', async (c) => {
  await requireUser(c)
  const body = await c.req.json().catch(() => ({})) as {
    since?: number
    changes?: Partial<Record<CollectionName, StoredRecord[]>>
  }
  const since = Number(body.since ?? 0) || 0
  const incoming = body.changes ?? {}
  const rejected = emptyCollections()

  const tx = db.transaction(() => {
    for (const collection of COLLECTIONS) {
      const records = incoming[collection] ?? []
      const result = upsertRecords(db, collection, records)
      rejected[collection] = result.rejected
    }
  })
  tx()

  const pulled = pullSince(db, since)
  const changes = emptyCollections()
  for (const collection of COLLECTIONS) {
    const byId = new Map(pulled[collection].map((item) => [item.id, item]))
    for (const record of rejected[collection]) byId.set(record.id, record)
    changes[collection] = [...byId.values()]
  }

  return c.json({ since, serverNow: Date.now(), changes })
})

/**
 * 内置前端。serveStatic 的 root 只认相对 cwd 的路径，所以绝对路径要先折回相对。
 * 目录不存在时整段跳过，纯 API 部署（宿主 nginx 发前端）行为保持不变。
 */
const staticDir = (() => {
  const raw = process.env.STATIC_DIR ?? './public'
  if (!raw) return null
  const absolute = resolve(raw)
  if (!existsSync(resolve(absolute, 'index.html'))) return null
  const rel = relative(process.cwd(), absolute).replace(/\\/g, '/')
  return { absolute, root: rel === '' || isAbsolute(rel) ? '.' : rel }
})()

if (staticDir) {
  const indexHtml = readFileSync(resolve(staticDir.absolute, 'index.html'), 'utf8')

  app.use('/*', serveStatic({
    root: staticDir.root,
    index: 'index.html',
    onFound: (path, c) => {
      // 回调里的 path 是命中文件的系统路径，Windows 下是反斜杠，先归一再判断
      // Vite 给 assets 打了内容哈希，可以长缓存；index.html 必须每次回源，否则发版后客户端拿旧壳
      if (path.replace(/\\/g, '/').includes('/assets/')) c.header('Cache-Control', 'public, max-age=31536000, immutable')
      else c.header('Cache-Control', 'no-cache')
    },
  }))

  // SPA 回退：非 /api 的未命中路径一律交还前端路由
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'not found' }, 404)
    return c.html(indexHtml, 200, { 'Cache-Control': 'no-cache' })
  })
}

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  console.error(err)
  return c.json({ error: 'internal error' }, 500)
})

serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
  const host = info.address === '::' || info.address === '0.0.0.0' ? 'localhost' : info.address
  printStartupBanner({
    username: USERNAME,
    credentials,
    secretSource,
    staticDir: staticDir?.absolute ?? null,
    url: `http://${host}:${info.port}`,
  })
})
