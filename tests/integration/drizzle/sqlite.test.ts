import { afterEach, describe } from 'bun:test'

import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import { roomAuth } from '../../helpers/auth'
import { migratedSqlite } from '../../helpers/sqlite'
import { contract } from '../contract'
import { schema } from './schema'

import type { Database } from 'bun:sqlite'

describe('drizzle over sqlite', () => {
  let database: Database | undefined
  afterEach(() => database?.close())
  contract({
    uniqueViolation: { code: 'SQLITE_CONSTRAINT_UNIQUE' },
    start: async options => {
      database = await migratedSqlite(options)
      return roomAuth(
        drizzleAdapter(drizzle(database, { schema }), {
          provider: 'sqlite',
          schema
        }),
        options
      )
    }
  })
})
