import { afterEach, describe } from 'bun:test'

import { roomAuth } from '../../helpers/auth'
import { migratedDatabases } from '../../helpers/postgres'
import { contract } from '../contract'

describe('kysely over postgres', () => {
  const migrated = migratedDatabases()
  let database: Awaited<ReturnType<typeof migrated>> | undefined
  afterEach(async () => {
    const current = database
    database = undefined
    await current?.close()
  })
  contract({
    uniqueViolation: { code: '23505' },
    start: async options => {
      database = await migrated(options)
      return roomAuth(database.pool, options)
    }
  })
})
