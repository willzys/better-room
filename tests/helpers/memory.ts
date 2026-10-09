import { memoryAdapter } from 'better-auth/adapters/memory'

import { codeFormat } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

import { roomAuth, SECRET } from './auth'
import { room, roomCode } from './fixtures'

import type { BetterAuthOptions } from 'better-auth/types'

import type { Room } from '@/core/room'
import type { RoomCode } from '@/core/room-code'
import type { RoomOptions } from '@/plugin/options'

export type Row = Record<string, unknown>
export type Table =
  | 'user'
  | 'session'
  | 'account'
  | 'verification'
  | 'room'
  | 'roomCode'
  | 'roomActor'
  | 'roomMember'
  | 'roomAttempt'
export type Tables = Record<Table, Row[]>

export const empty = (): Tables => ({
  user: [],
  session: [],
  account: [],
  verification: [],
  room: [],
  roomCode: [],
  roomActor: [],
  roomMember: [],
  roomAttempt: []
})

export const memoryAuth = (
  db: Tables,
  options?: RoomOptions,
  secret = SECRET,
  databaseHooks?: BetterAuthOptions['databaseHooks']
) =>
  roomAuth(memoryAdapter(db), options, {
    secret,
    ...(databaseHooks === undefined ? {} : { databaseHooks })
  })

export const seedRoom = async (
  db: Tables,
  seed: {
    room?: Partial<Room>
    code?: Partial<RoomCode>
    options?: RoomOptions
    plaintext?: string
    secret?: string
  } = {}
) => {
  const format = codeFormat(
    seed.options?.code?.format ?? 'crockford',
    seed.options?.code?.length
  )
  const plaintext = seed.plaintext ?? '1'.repeat(format.length)
  const identifier = await codeIdentifier({
    format,
    secret: seed.secret ?? SECRET
  })(plaintext)
  if (identifier === null) throw new Error('Invalid room code fixture')
  const seededRoom = room(seed.room)
  db.room.push(seededRoom)
  db.roomCode.push(
    roomCode({
      id: `code-${db.roomCode.length + 1}`,
      identifier,
      roomId: seededRoom.id,
      ...seed.code
    })
  )
  return plaintext
}
