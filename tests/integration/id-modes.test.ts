import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'

import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { getMigrations } from 'better-auth/db/migration'
import { MongoClient } from 'mongodb'

import { betterRoom } from '@/plugin'

import { SECRET } from '../helpers/auth'
import { codeOf, onlyRow } from '../helpers/http'
import { mongoAddress } from '../helpers/mongo'
import { postgresDatabase } from '../helpers/postgres'
import { holding, walkedListing } from './contract/harness'

import type { BetterAuthOptions } from 'better-auth/types'

import type { Auth } from './contract/harness'

type GenerateId = 'serial' | 'uuid' | undefined

type Storage = NonNullable<BetterAuthOptions['database']>

const FROM = { 'x-forwarded-for': '203.0.113.7' }

const optionsFor = <Store extends Storage>(
  database: Store,
  generateId: GenerateId
) => ({
  secret: SECRET,
  baseURL: 'http://localhost:3000',
  database,
  ...(generateId === undefined
    ? {}
    : { advanced: { database: { generateId } } }),
  plugins: [betterRoom({ attempts: { perIp: 2, window: 60 } })]
})

const instance = <Store extends Storage>(
  database: Store,
  generateId: GenerateId
) => betterAuth(optionsFor(database, generateId))

const rows = async (auth: Auth, model: 'roomCode' | 'roomAttempt') =>
  (await auth.$context).adapter.findMany<Record<string, unknown>>({
    model,
    limit: 100
  })

const joining = (auth: Auth, code: string, headers = {}) =>
  auth.api.joinRoom({
    body: { code },
    headers: new Headers(headers),
    asResponse: true
  })

const closers: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map(close => close()))
})

const sqlite = async (generateId: GenerateId): Promise<Auth> => {
  const database = new Database(':memory:')
  closers.push(() => Promise.resolve(database.close()))
  database.run('PRAGMA foreign_keys = ON')
  await (await getMigrations(optionsFor(database, generateId))).runMigrations()

  return instance(database, generateId)
}

const postgres = async (generateId: GenerateId): Promise<Auth> => {
  const database = await postgresDatabase()
  closers.push(database.close)
  await (
    await getMigrations(optionsFor(database.pool, generateId))
  ).runMigrations()

  return instance(database.pool, generateId)
}

const mongo = async (generateId: GenerateId): Promise<Auth> => {
  const client = new MongoClient(await mongoAddress(), {
    serverSelectionTimeoutMS: 5000
  })
  const database = client.db(
    `better_room_ids_${crypto.randomUUID().replaceAll('-', '')}`
  )
  closers.push(async () => {
    try {
      await database.dropDatabase()
    } finally {
      await client.close()
    }
  })
  await client.connect()

  return instance(mongodbAdapter(database), generateId)
}

const modes = [
  ['sqlite', 'serial', sqlite],
  ['sqlite', 'uuid', sqlite],
  ['postgres', 'serial', postgres],
  ['postgres', 'uuid', postgres],
  ['mongodb', undefined, mongo],
  ['mongodb', 'uuid', mongo]
] as const

for (const [backend, generateId, start] of modes) {
  describe(`${backend} with ${generateId ?? 'default'} ids`, () => {
    test('resolves a code stored under an id the framework generated', async () => {
      const auth = await start(generateId)
      const created = await auth.api.createRoom({ body: {} })
      const stored = onlyRow(await rows(auth, 'roomCode'))

      expect(stored.id).not.toBe(stored.identifier)
      expect((await joining(auth, created.code)).status).toBe(200)
    })

    test('keeps the replaced code admitting beside the one that replaced it', async () => {
      const auth = await start(generateId)
      const created = await auth.api.createRoom({ body: {} })
      const rotated = await auth.api.rotateRoomCode({
        body: { roomId: created.room.id }
      })

      expect((await joining(auth, created.code)).status).toBe(200)
      expect((await joining(auth, rotated.code)).status).toBe(200)
    })

    test('counts failed attempts against one row per budget', async () => {
      const auth = await start(generateId)

      expect((await joining(auth, 'ZZZZZZZZ', FROM)).status).toBe(400)
      expect((await joining(auth, 'ZZZZZZZZ', FROM)).status).toBe(400)

      const blocked = await joining(auth, 'ZZZZZZZZ', FROM)

      expect(blocked.status).toBe(429)
      expect(await codeOf(blocked)).toBe('TOO_MANY_ATTEMPTS')

      const counted = await rows(auth, 'roomAttempt')

      expect(new Set(counted.map(row => row.key))).toEqual(
        new Set(['global', 'ip:203.0.113.7'])
      )
      expect(counted.map(row => row.count)).toEqual([2, 2])
    })

    test('pages the memberships in the order the database keeps', async () => {
      const auth = await start(generateId)
      const { cookie, perpetual, dated } = await holding(auth, 250, 200)

      const seen = (await walkedListing(auth, cookie)).flat()

      expect(seen).toHaveLength(perpetual.length + dated.length)
      expect(new Set(seen)).toEqual(new Set([...perpetual, ...dated]))
    })
  })
}
