import { afterEach, describe, expect, test } from 'bun:test'

import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { MongoClient } from 'mongodb'

import { roomAuth } from '../../helpers/auth'
import { mongoAddress } from '../../helpers/mongo'
import { contract } from '../contract'
import { join } from '../contract/harness'

import type { RoomOptions } from '@/plugin/options'

const DECLARED = {
  room: ['room_created_by_idx'],
  roomCode: ['room_code_identifier_uidx', 'room_code_room_status_idx'],
  roomMember: [
    'room_member_room_actor_uidx',
    'room_member_actor_idx',
    'room_member_expires_at_idx'
  ],
  roomAttempt: ['room_attempt_key_uidx', 'room_attempt_last_attempt_at_idx']
} as const

describe('mongo over mongodb', () => {
  let client: MongoClient | undefined
  let database: ReturnType<MongoClient['db']> | undefined
  afterEach(async () => {
    const currentDatabase = database
    const currentClient = client
    database = undefined
    client = undefined
    try {
      await currentDatabase?.dropDatabase()
    } finally {
      await currentClient?.close()
    }
  })

  const start = async (options?: RoomOptions) => {
    client = new MongoClient(await mongoAddress(), {
      serverSelectionTimeoutMS: 5000
    })
    await client.connect()
    database = client.db(
      'better_room_test_' + crypto.randomUUID().replaceAll('-', '')
    )
    await database.collection('roomActor').createIndex(
      { userId: 1 },
      {
        unique: true,
        name: 'room_actor_user_uidx',
        partialFilterExpression: { userId: { $type: 'string' } }
      }
    )
    return roomAuth(mongodbAdapter(database), options, {
      advanced: { database: { generateId: () => crypto.randomUUID() } }
    })
  }

  contract({ uniqueViolation: { code: 11000 }, start })

  test('creates every index the schema declares at table level', async () => {
    const auth = await start()
    const created = await auth.api.createRoom({ body: {} })
    await join(auth, 'ZZZZZZZZ')
    await join(auth, created.code)
    const opened = database
    if (opened === undefined) throw new Error('No database was opened')

    const listed = await Promise.all(
      Object.keys(DECLARED).map(async collection =>
        (await opened.collection(collection).indexes()).map(index => index.name)
      )
    )

    expect(listed).toEqual(
      Object.values(DECLARED).map(names => expect.arrayContaining([...names]))
    )
  })
})
