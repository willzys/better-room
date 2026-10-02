import type { BetterAuthPluginDBSchema, DBFieldAttribute } from 'better-auth/db'
import { mergeSchema } from 'better-auth/db'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { Room } from '@/core/room'
import type { RoomCode } from '@/core/room-code'

type FieldNames<T> = { [K in keyof Omit<T, 'id'>]?: string }

type AdditionalFields = Record<string, DBFieldAttribute>

type RoomTable = BetterAuthPluginDBSchema[string]

export type RoomSchemaOption = {
  roomActor?: {
    modelName?: string
    fields?: FieldNames<Actor>
  }
  room?: {
    modelName?: string
    fields?: FieldNames<Room>
    additionalFields?: AdditionalFields
  }
  roomCode?: {
    modelName?: string
    fields?: FieldNames<RoomCode>
  }
  roomMember?: {
    modelName?: string
    fields?: FieldNames<Membership>
    additionalFields?: AdditionalFields
  }
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
        references: { model: 'user', field: 'id', onDelete: 'cascade' }
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
      expiresAt: { type: 'date', required: false },
      leftAt: { type: 'date', required: false },
      revokedAt: { type: 'date', required: false },
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

export const createRoomSchema = (options?: RoomSchemaOption) =>
  mergeSchema(
    {
      roomActor: actorTable(),
      room: roomTable(options?.room?.additionalFields),
      roomCode: codeTable(),
      roomMember: memberTable(options?.roomMember?.additionalFields)
    },
    options
  )
