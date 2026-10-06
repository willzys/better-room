import { isRoomStatus } from '@/core/room'
import { isRoomCodeStatus } from '@/core/room-code'

import type { Actor } from '@/core/actor'
import type { Attempt } from '@/core/attempt'
import type { Membership } from '@/core/membership'
import type { Room } from '@/core/room'
import type { RoomCode } from '@/core/room-code'
import type { Pending, Usable } from '@/types/absence'

export const MODELS = {
  actor: 'roomActor',
  room: 'room',
  code: 'roomCode',
  member: 'roomMember',
  attempt: 'roomAttempt',
  user: 'user'
} as const

type Nullable<T, K extends keyof T> = Omit<T, K> & {
  [P in K]?: T[P] | undefined
}

type Stored<T, Status extends keyof T> = Omit<T, Status> & {
  readonly [P in Status]: string
}

export type ActorRow = Nullable<Actor, 'userId'>
export type RoomRow = Nullable<
  Stored<Room, 'status'>,
  'maxMembers' | 'expiresAt' | 'createdBy'
>
export type CodeRow = Nullable<
  Stored<RoomCode, 'status'>,
  'expiresAt' | 'revokedAt'
>
export type MemberRow = Nullable<
  Membership & { occupancy: number; releasedAt: Pending<Date> },
  'expiresAt' | 'leftAt' | 'revokedAt' | 'releasedAt'
>
export type AttemptRow = Attempt & { id: string }
export type UserRow = { id: string }

export type ActorInput = Pick<Actor, 'userId'>
export type RoomInput = Pick<Room, 'createdBy' | 'maxMembers' | 'expiresAt'>
export type CodeInput = Pick<
  RoomCode,
  'identifier' | 'roomId' | 'status' | 'createdAt'
>
export type MemberInput = Pick<
  Membership,
  'roomId' | 'actorId' | 'role' | 'expiresAt' | 'leftAt'
> & { occupancy: number }
export type AttemptInput = Attempt

const corrupt = (model: string, id: string, field: string, value: string) =>
  new TypeError(`${model} ${id} holds an unknown ${field} '${value}'`)

export const toActor = (row: ActorRow): Actor => ({
  id: row.id,
  userId: row.userId ?? null,
  grantEpoch: row.grantEpoch,
  createdAt: row.createdAt
})

export const toRoom = (row: RoomRow): Room => {
  if (!isRoomStatus(row.status)) {
    throw corrupt(MODELS.room, row.id, 'status', row.status)
  }

  return {
    id: row.id,
    status: row.status,
    memberCount: row.memberCount,
    maxMembers: row.maxMembers ?? null,
    expiresAt: row.expiresAt ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt
  }
}

export const toCode = (row: CodeRow): RoomCode => {
  if (!isRoomCodeStatus(row.status)) {
    throw corrupt(MODELS.code, row.id, 'status', row.status)
  }

  return {
    id: row.id,
    identifier: row.identifier,
    roomId: row.roomId,
    status: row.status,
    expiresAt: row.expiresAt ?? null,
    revokedAt: row.revokedAt ?? null,
    createdAt: row.createdAt
  }
}

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

export const toAttempt = (row: AttemptRow): Attempt => ({
  key: row.key,
  count: row.count,
  lastAttemptAt: row.lastAttemptAt
})

export const found = <Row, Value>(
  row: Usable<Row>,
  read: (row: Row) => Value
): Usable<Value> => (row === null ? null : read(row))
