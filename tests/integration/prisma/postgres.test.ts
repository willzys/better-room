import { afterEach, describe } from 'bun:test'

import { PrismaPg } from '@prisma/adapter-pg'
import { prismaAdapter } from 'better-auth/adapters/prisma'

import { roomAuth } from '../../helpers/auth'
import { migratedDatabases } from '../../helpers/postgres'
import { contract } from '../contract'
import { generateClient } from './generate'

await generateClient()
const { PrismaClient } =
  await import('../../../node_modules/.prisma/better-room/index.js')

describe('prisma over postgres', () => {
  const migrated = migratedDatabases()
  let database: Awaited<ReturnType<typeof migrated>> | undefined
  let prisma: InstanceType<typeof PrismaClient> | undefined
  afterEach(async () => {
    const currentClient = prisma
    const currentDatabase = database
    prisma = undefined
    database = undefined
    try {
      await currentClient?.$disconnect()
    } finally {
      await currentDatabase?.close()
    }
  })
  contract({
    uniqueViolation: { code: 'P2002' },
    start: async options => {
      database = await migrated(options)
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: database.url })
      })
      return roomAuth(
        prismaAdapter(prisma, { provider: 'postgresql' }),
        options
      )
    }
  })
})
