import { Database } from 'bun:sqlite'
import { afterEach, beforeEach } from 'bun:test'

import { betterAuth } from 'better-auth'
import { getAdapter } from 'better-auth/db/adapter'
import { getMigrations } from 'better-auth/db/migration'

import { authOptions } from './auth'

import type { RoomOptions } from '@/plugin/options'

import type { Row, Table } from './memory'

export const migratedSqlite = async (room?: RoomOptions) => {
  const database = new Database(':memory:')
  database.run('PRAGMA foreign_keys = ON')
  await (await getMigrations(authOptions(database, room))).runMigrations()

  return database
}

export const sqliteFixture = () => {
  let database: Database

  beforeEach(async () => {
    database = await migratedSqlite()
  })
  afterEach(() => database?.close())

  return {
    auth: (room?: RoomOptions) => betterAuth(authOptions(database, room)),
    adapter: () => getAdapter(authOptions(database)),
    rows: (table: Table) =>
      database.query<Row, []>(`select * from "${table}"`).all(),
    get database() {
      return database
    }
  }
}
