import { afterEach, describe } from 'bun:test'

import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/node-postgres'

import { roomAuth } from '../../helpers/auth'
import { migratedDatabases } from '../../helpers/postgres'
import { contract } from '../contract'
import { schema } from './schema-pg'

describe('drizzle over postgres', () => {
  const migrated = migratedDatabases()
  let database: Awaited<ReturnType<typeof migrated>> | undefined
  afterEach(async () => {
    const current = database
    database = undefined
    await current?.close()
  })
  contract({
    uniqueViolation: { cause: { code: '23505' } },
    start: async options => {
      database = await migrated(options)
      return roomAuth(
        drizzleAdapter(drizzle(database.pool, { schema }), {
          provider: 'pg',
          schema
        }),
        options
      )
    }
  })
})
