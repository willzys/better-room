import { mergeSchema } from 'better-auth/db'

import type { BetterAuthPluginDBSchema, DBFieldAttribute } from 'better-auth/db'
import type { InferOptionSchema } from 'better-auth/types'

type AdditionalFields = Record<string, DBFieldAttribute>

type RoomTable = BetterAuthPluginDBSchema[string]

type Extendable = {
  additionalFields?: AdditionalFields
}

const timestamp = () =>
  ({
    type: 'date',
    required: true,
    defaultValue: () => new Date()
  }) satisfies DBFieldAttribute

const actorTable = () =>
  ({
    fields: {
      userId: {
        type: 'string',
        required: false,
        unique: true,
        references: { model: 'user', field: 'id', onDelete: 'set null' }
      },
      grantEpoch: {
        type: 'number',
        required: true,
        defaultValue: 0,
        input: false
      },
      createdAt: timestamp()
    }
  }) satisfies RoomTable

const roomTable = (additionalFields?: AdditionalFields) =>
  ({
    fields: {
      status: {
        type: ['active', 'locked', 'closed'],
        required: true,
        defaultValue: 'active'
      },
      memberCount: {
        type: 'number',
        required: true,
        defaultValue: 0,
        input: false
      },
      maxMembers: { type: 'number', required: false },
      expiresAt: { type: 'date', required: false },
      createdBy: {
        type: 'string',
        required: false,
        references: { model: 'roomActor', field: 'id', onDelete: 'set null' }
      },
      createdAt: timestamp(),
      ...additionalFields
    }
  }) satisfies RoomTable

const codeTable = () =>
  ({
    fields: {
      identifier: {
        type: 'string',
        required: true,
        input: false
      },
      roomId: {
        type: 'string',
        required: true,
        references: { model: 'room', field: 'id', onDelete: 'cascade' }
      },
      status: {
        type: ['active', 'grace', 'revoked'],
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

const memberTable = (additionalFields?: AdditionalFields) =>
  ({
    fields: {
      roomId: {
        type: 'string',
        required: true,
        references: { model: 'room', field: 'id', onDelete: 'cascade' }
      },
      actorId: {
        type: 'string',
        required: true,
        index: true,
        references: { model: 'roomActor', field: 'id', onDelete: 'cascade' }
      },
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
      occupancy: {
        type: 'number',
        required: true,
        defaultValue: 1,
        input: false
      },
      releasedAt: { type: 'date', required: false },
      ...additionalFields
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
      key: {
        type: 'string',
        required: true,
        input: false
      },
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

type BaseSchema = {
  roomActor: ReturnType<typeof actorTable>
  room: ReturnType<typeof roomTable>
  roomCode: ReturnType<typeof codeTable>
  roomMember: ReturnType<typeof memberTable>
  roomAttempt: ReturnType<typeof attemptTable>
}

export type RoomSchemaOption = InferOptionSchema<BaseSchema> & {
  room?: Extendable
  roomMember?: Extendable
}

export const createRoomSchema = (options?: RoomSchemaOption) =>
  mergeSchema(
    {
      roomActor: actorTable(),
      room: roomTable(options?.room?.additionalFields),
      roomCode: codeTable(),
      roomMember: memberTable(options?.roomMember?.additionalFields),
      roomAttempt: attemptTable()
    },
    options
  )
