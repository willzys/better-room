import { afterEach, describe } from 'bun:test'

import { roomAuth } from '../../helpers/auth'
import { migratedSqlite } from '../../helpers/sqlite'
import { contract } from '../contract'

import type { Database } from 'bun:sqlite'

describe('kysely over sqlite', () => {
  let database: Database | undefined
  afterEach(() => database?.close())
  contract({
    uniqueViolation: { code: 'SQLITE_CONSTRAINT_UNIQUE' },
    start: async options => {
      database = await migratedSqlite(options)
      return roomAuth(database, options)
    }
  })
})
