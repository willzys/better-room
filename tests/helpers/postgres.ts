import { afterAll } from 'bun:test'
import { randomUUID } from 'node:crypto'

import { getMigrations } from 'better-auth/db/migration'
import { Pool } from 'pg'

import { authOptions } from './auth'
import { postgresUrl } from './servers'

import type { RoomOptions } from '@/plugin/options'

await postgresUrl()

const uniqueName = (prefix: string) =>
  `${prefix}_${randomUUID().replaceAll('-', '')}`

const adminPool = async () =>
  new Pool({
    connectionString: await postgresUrl(),
    connectionTimeoutMillis: 5000
  })

const urlOf = async (name: string) => {
  const url = new URL(await postgresUrl())
  url.pathname = `/${name}`

  return url.href
}

const created = async (name: string, template?: string) => {
  const admin = await adminPool()

  try {
    await admin.query(
      template === undefined
        ? `CREATE DATABASE "${name}"`
        : `CREATE DATABASE "${name}" TEMPLATE "${template}"`
    )
  } finally {
    await admin.end()
  }
}

const dropped = async (name: string) => {
  const admin = await adminPool()

  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  } finally {
    await admin.end()
  }
}

export const postgresDatabase = async (template?: string) => {
  const name = uniqueName('better_room_test')
  const url = await urlOf(name)

  await created(name, template)

  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: 5000
  })

  return {
    pool,
    url,
    close: async () => {
      try {
        await pool.end()
      } finally {
        await dropped(name)
      }
    }
  }
}

const migratedTemplate = async (options?: RoomOptions) => {
  const name = uniqueName('better_room_template')

  await created(name)

  const pool = new Pool({
    connectionString: await urlOf(name),
    connectionTimeoutMillis: 5000
  })

  try {
    await (await getMigrations(authOptions(pool, options))).runMigrations()
  } catch (error) {
    await pool.end()
    await dropped(name)
    throw error
  }

  await pool.end()

  return name
}

export const migratedDatabases = () => {
  const templates = new Map<string, Promise<string>>()

  afterAll(async () => {
    const names = await Promise.allSettled(templates.values())
    templates.clear()
    await Promise.all(
      names.flatMap(name =>
        name.status === 'fulfilled' ? [dropped(name.value)] : []
      )
    )
  })

  const templateFor = (options?: RoomOptions) => {
    const key = JSON.stringify(options?.schema ?? null)
    const known = templates.get(key)

    if (known !== undefined) return known

    const pending = migratedTemplate(options)
    templates.set(key, pending)
    pending.catch(() => templates.delete(key))

    return pending
  }

  return async (options?: RoomOptions) =>
    postgresDatabase(await templateFor(options))
}
