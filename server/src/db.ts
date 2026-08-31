import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

export const COLLECTIONS = ['tasks', 'projects', 'tags', 'scheduleEvents', 'timerProfiles'] as const
export type CollectionName = (typeof COLLECTIONS)[number]

const TABLE_BY_COLLECTION: Record<CollectionName, string> = {
  tasks: 'tasks',
  projects: 'projects',
  tags: 'tags',
  scheduleEvents: 'schedule_events',
  timerProfiles: 'timer_profiles',
}

export function openDb(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schedule_events (
      id TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS timer_profiles (
      id TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at);
    CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at);
    CREATE INDEX IF NOT EXISTS idx_tags_updated ON tags(updated_at);
    CREATE INDEX IF NOT EXISTS idx_schedule_events_updated ON schedule_events(updated_at);
    CREATE INDEX IF NOT EXISTS idx_timer_profiles_updated ON timer_profiles(updated_at);
  `)
  db.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1')`).run()
  return db
}

export interface StoredRecord {
  id: string
  updatedAt: number
  deletedAt: number | null
  [key: string]: unknown
}

export function emptyCollections(): Record<CollectionName, StoredRecord[]> {
  return {
    tasks: [],
    projects: [],
    tags: [],
    scheduleEvents: [],
    timerProfiles: [],
  }
}

export function pullSince(db: Database.Database, since: number) {
  const result = emptyCollections()
  for (const collection of COLLECTIONS) {
    const table = TABLE_BY_COLLECTION[collection]
    const rows = db.prepare(`SELECT payload FROM ${table} WHERE updated_at > ?`).all(since) as Array<{ payload: string }>
    result[collection] = rows.map((row) => JSON.parse(row.payload) as StoredRecord)
  }
  return result
}

export function upsertRecords(db: Database.Database, collection: CollectionName, records: StoredRecord[]) {
  const table = TABLE_BY_COLLECTION[collection]
  const select = db.prepare(`SELECT updated_at, payload FROM ${table} WHERE id = ?`)
  const upsert = db.prepare(`
    INSERT INTO ${table} (id, updated_at, deleted_at, payload)
    VALUES (@id, @updatedAt, @deletedAt, @payload)
    ON CONFLICT(id) DO UPDATE SET
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      payload = excluded.payload
  `)

  const accepted: StoredRecord[] = []
  const rejected: StoredRecord[] = []

  for (const record of records) {
    if (!record?.id || typeof record.updatedAt !== 'number') continue
    const existing = select.get(record.id) as { updated_at: number; payload: string } | undefined
    if (existing && record.updatedAt < existing.updated_at) {
      rejected.push(JSON.parse(existing.payload) as StoredRecord)
      continue
    }
    if (existing && record.updatedAt === existing.updated_at) {
      rejected.push(JSON.parse(existing.payload) as StoredRecord)
      continue
    }
    upsert.run({
      id: record.id,
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt ?? null,
      payload: JSON.stringify(record),
    })
    accepted.push(record)
  }

  return { accepted, rejected }
}

export function pruneTombstones(db: Database.Database, olderThanMs: number) {
  for (const collection of COLLECTIONS) {
    const table = TABLE_BY_COLLECTION[collection]
    db.prepare(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < ?`).run(olderThanMs)
  }
}
