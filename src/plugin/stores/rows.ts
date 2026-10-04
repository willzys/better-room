import type { DBAdapter, Where } from 'better-auth/types'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { Room } from '@/core/room'
import type { RoomCode } from '@/core/room-code'
import type { Unbounded, Usable } from '@/types/absence'

export const MODELS = {
  actor: 'roomActor',
  room: 'room',
  code: 'roomCode',
  member: 'roomMember',
  attempt: 'roomAttempt'
} as const

export const HELD_CEILING = 200

export type Input = Record<string, unknown>

type Nullable<T, K extends keyof T> = Omit<T, K> & {
  [P in K]?: T[P] | undefined
}

export type ActorRow = Nullable<Actor, 'userId'>
export type RoomRow = Nullable<Room, 'maxMembers' | 'expiresAt' | 'createdBy'>
export type CodeRow = Nullable<RoomCode, 'expiresAt' | 'revokedAt'>
export type MemberRow = Nullable<
  Membership,
  'expiresAt' | 'leftAt' | 'revokedAt'
>

export type Rows = DBAdapter

export const toActor = (row: ActorRow): Actor => ({
  id: row.id,
  userId: row.userId ?? null,
  grantEpoch: row.grantEpoch,
  createdAt: row.createdAt
})

export const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  status: row.status,
  memberCount: row.memberCount,
  maxMembers: row.maxMembers ?? null,
  expiresAt: row.expiresAt ?? null,
  createdBy: row.createdBy ?? null,
  createdAt: row.createdAt
})

export const toCode = (row: CodeRow): RoomCode => ({
  id: row.id,
  identifier: row.identifier,
  roomId: row.roomId,
  status: row.status,
  expiresAt: row.expiresAt ?? null,
  revokedAt: row.revokedAt ?? null,
  createdAt: row.createdAt
})

export const byIdentifier = (identifier: string): Where[] => [
  { field: 'identifier', value: identifier }
]

export const byKey = (key: string): Where[] => [{ field: 'key', value: key }]

export const toMembership = (row: MemberRow): Membership => ({
  id: row.id,
  roomId: row.roomId,
  actorId: row.actorId,
  role: row.role,
  joinedAt: row.joinedAt,
  expiresAt: row.expiresAt ?? null,
  leftAt: row.leftAt ?? null,
  revokedAt: row.revokedAt ?? null
})

export const found = <Row, Value>(
  row: Usable<Row>,
  read: (row: Row) => Value
): Usable<Value> => (row === null ? null : read(row))

export const byId = (id: string): Where[] => [{ field: 'id', value: id }]

export const OCCUPIED: Where = { field: 'occupancy', operator: 'gt', value: 0 }
export const VACATED: Where = { field: 'occupancy', value: 0 }

export const pairing = (roomId: string, actorId: string): Where[] => [
  { field: 'roomId', value: roomId },
  { field: 'actorId', value: actorId }
]

export const capacityGuard = (
  roomId: string,
  limit: Unbounded<number>
): Where[] =>
  limit === null
    ? byId(roomId)
    : [...byId(roomId), { field: 'memberCount', operator: 'lt', value: limit }]
