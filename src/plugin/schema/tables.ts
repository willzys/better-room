import { mergeSchema } from 'better-auth/db'

import { ROOM_STATUSES } from '@/core/room'
import { ROOM_CODE_STATUSES } from '@/core/room-code'
import { extendedTable } from '@/plugin/schema/extension'

import type { BetterAuthPluginDBSchema, DBFieldAttribute } from 'better-auth/db'
import type { InferOptionSchema } from 'better-auth/types'

import type { Extendable } from '@/plugin/schema/extension'

type RoomTable = BetterAuthPluginDBSchema[string]

export const MAX_STORED_INTEGER = 2_147_483_647

const timestamp = () =>
  ({
    type: 'date',
    required: true,
    defaultValue: () => new Date()
  }) satisfies DBFieldAttribute

const reference = (
  model: string,
  onDelete: 'cascade' | 'restrict' | 'set null',
  required: boolean
) =>
  ({
    type: 'string',
    required,
    references: { model, field: 'id', onDelete }
  }) satisfies DBFieldAttribute

const counter = (initial: number) =>
  ({
    type: 'number',
    required: true,
    defaultValue: initial,
    input: false
  }) satisfies DBFieldAttribute

const derived = () =>
  ({ type: 'string', required: true, input: false }) satisfies DBFieldAttribute

const actorTable = () =>
  ({
    fields: {
      userId: { type: 'string', required: false, unique: true },
      grantEpoch: counter(0),
      createdAt: timestamp()
    }
  }) satisfies RoomTable

const roomTable = () =>
  ({
    fields: {
      status: {
        type: [...ROOM_STATUSES],
        required: true,
        defaultValue: 'active'
      },
      memberCount: counter(0),
      maxMembers: { type: 'number', required: false },
      expiresAt: { type: 'date', required: false },
      createdBy: reference('roomActor', 'set null', false),
      createdAt: timestamp()
    },
    indexes: [
      {
        fields: ['createdBy'] as const,
        name: 'room_created_by_idx'
      }
    ]
  }) satisfies RoomTable

const codeTable = () =>
  ({
    fields: {
      identifier: derived(),
      roomId: reference('room', 'cascade', true),
      status: {
        type: [...ROOM_CODE_STATUSES],
        required: true,
        defaultValue: 'active'
      },
      expiresAt: { type: 'date', required: false },
      revokedAt: { type: 'date', required: false },
      createdAt: timestamp()
    },
    indexes: [
      {
        fields: ['identifier'] as const,
        unique: true,
        name: 'room_code_identifier_uidx'
      },
      {
        fields: ['roomId', 'status'] as const,
        name: 'room_code_room_status_idx'
      }
    ]
  }) satisfies RoomTable

const memberTable = () =>
  ({
    fields: {
      roomId: reference('room', 'cascade', true),
      actorId: { ...reference('roomActor', 'restrict', true), index: true },
      role: {
        type: 'string',
        required: true,
        defaultValue: 'participant',
        sortable: true
      },
      joinedAt: timestamp(),
      expiresAt: { type: 'date', required: false, index: true },
      leftAt: { type: 'date', required: false },
      revokedAt: { type: 'date', required: false },
      occupancy: counter(1),
      releasedAt: { type: 'date', required: false }
    },
    indexes: [
      {
        fields: ['roomId', 'actorId'] as const,
        unique: true,
        name: 'room_member_room_actor_uidx'
      }
    ]
  }) satisfies RoomTable

const attemptTable = () =>
  ({
    fields: {
      key: derived(),
      count: {
        type: 'number',
        required: true,
        defaultValue: 1
      },
      lastAttemptAt: {
        type: 'date',
        required: true,
        index: true
      }
    },
    indexes: [
      {
        fields: ['key'] as const,
        unique: true,
        name: 'room_attempt_key_uidx'
      }
    ]
  }) satisfies RoomTable

const baseSchema = () => ({
  roomActor: actorTable(),
  room: roomTable(),
  roomCode: codeTable(),
  roomMember: memberTable(),
  roomAttempt: attemptTable()
})

type BaseSchema = ReturnType<typeof baseSchema>

export type RoomSchemaOption = InferOptionSchema<BaseSchema> & {
  room?: Extendable
  roomMember?: Extendable
}

export const createRoomSchema = (options?: RoomSchemaOption) => {
  const base = baseSchema()

  return mergeSchema(
    {
      ...base,
      room: extendedTable('room', base.room, options?.room),
      roomMember: extendedTable(
        'roomMember',
        base.roomMember,
        options?.roomMember
      )
    },
    options
  )
}
