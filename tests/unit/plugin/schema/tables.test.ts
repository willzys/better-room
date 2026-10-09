import { expect, test } from 'bun:test'

import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { betterRoom } from '@/plugin'
import { codeFormat, generate } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

const SECRET = 'rename-probe-secret'
const format = codeFormat('crockford')
const identify = codeIdentifier({ format, secret: SECRET })

type Row = Record<string, unknown>

type Tables = {
  user: Row[]
  session: Row[]
  account: Row[]
  verification: Row[]
  chat_room: Row[]
  chat_code: Row[]
  chat_actor: Row[]
  chat_member: Row[]
  chat_attempt: Row[]
}

test('honours a renamed model and renamed fields', async () => {
  const db: Tables = {
    user: [],
    session: [],
    account: [],
    verification: [],
    chat_room: [],
    chat_code: [],
    chat_actor: [],
    chat_member: [],
    chat_attempt: []
  }

  const auth = betterAuth({
    secret: SECRET,
    baseURL: 'http://localhost:3000',
    database: memoryAdapter(db),
    plugins: [
      betterRoom({
        schema: {
          room: { modelName: 'chat_room' },
          roomCode: { modelName: 'chat_code', fields: { roomId: 'chat_id' } },
          roomActor: { modelName: 'chat_actor' },
          roomMember: { modelName: 'chat_member' },
          roomAttempt: { modelName: 'chat_attempt' }
        }
      })
    ]
  })

  const code = generate(format)

  db.chat_room.push({
    id: 'room-1',
    status: 'active',
    memberCount: 0,
    maxMembers: null,
    expiresAt: null,
    createdBy: null,
    createdAt: new Date()
  })

  db.chat_code.push({
    id: 'code-1',
    identifier: await identify(code),
    chat_id: 'room-1',
    status: 'active',
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date()
  })

  const response = await auth.api.joinRoom({
    body: { code },
    asResponse: true
  })

  expect(response.status).toBe(200)
  expect(db.chat_member).toHaveLength(1)
  expect(db.chat_member[0]?.roomId).toBe('room-1')
  expect(db.chat_actor).toHaveLength(1)
  expect(db.chat_room[0]?.memberCount).toBe(1)
})
