import { APIError } from 'better-auth/api'

import type { DBAdapter, Where } from 'better-auth/types'

import type { Actor, ActorStore } from '@/core/actor'
import type { Attempt, AttemptStore } from '@/core/attempt'
import type { Membership } from '@/core/membership'
import type { AccessStore } from '@/core/operations/access'
import type { AdditionStore } from '@/core/operations/addition'
import type { CreationStore } from '@/core/operations/creation'
import type { JoinStore } from '@/core/operations/join'
import type { MembershipsStore } from '@/core/operations/memberships'
import type { RotationStore } from '@/core/operations/rotation'
import type { Room } from '@/core/room'
import type { RoomCode } from '@/core/room-code'
import type { Unbounded, Unlinked, Usable } from '@/types/absence'

const MODELS = {
  actor: 'roomActor',
  room: 'room',
  code: 'roomCode',
  member: 'roomMember',
  attempt: 'roomAttempt'
} as const

const HELD_CEILING = 200

type Input = Record<string, unknown>

type Nullable<T, K extends keyof T> = Omit<T, K> & {
  [P in K]?: T[P] | undefined
}

type ActorRow = Nullable<Actor, 'userId'>
type RoomRow = Nullable<Room, 'maxMembers' | 'expiresAt' | 'createdBy'>
type CodeRow = Nullable<RoomCode, 'expiresAt' | 'revokedAt'>
type MemberRow = Nullable<Membership, 'expiresAt' | 'leftAt' | 'revokedAt'>

const toActor = (row: ActorRow): Actor => ({
  ...row,
  userId: row.userId ?? null
})

const toRoom = (row: RoomRow): Room => ({
  ...row,
  maxMembers: row.maxMembers ?? null,
  expiresAt: row.expiresAt ?? null,
  createdBy: row.createdBy ?? null
})

const toCode = (row: CodeRow): RoomCode => ({
  ...row,
  expiresAt: row.expiresAt ?? null,
  revokedAt: row.revokedAt ?? null
})

const toMembership = (row: MemberRow): Membership => ({
  ...row,
  expiresAt: row.expiresAt ?? null,
  leftAt: row.leftAt ?? null,
  revokedAt: row.revokedAt ?? null
})

const found = <Row, Value>(
  row: Usable<Row>,
  read: (row: Row) => Value
): Usable<Value> => (row === null ? null : read(row))

const byId = (id: string): Where[] => [{ field: 'id', value: id }]

const capacityGuard = (roomId: string, limit: Unbounded<number>): Where[] =>
  limit === null
    ? byId(roomId)
    : [...byId(roomId), { field: 'memberCount', operator: 'lt', value: limit }]

export const actorStore = (adapter: DBAdapter): ActorStore => ({
  byId: async id =>
    found(
      await adapter.findOne<ActorRow>({
        model: MODELS.actor,
        where: byId(id)
      }),
      toActor
    ),
  byUser: async userId =>
    found(
      await adapter.findOne<ActorRow>({
        model: MODELS.actor,
        where: [{ field: 'userId', value: userId }]
      }),
      toActor
    ),
  create: async (userId: Unlinked<string>) =>
    toActor(
      await adapter.create<Input, ActorRow>({
        model: MODELS.actor,
        data: { userId }
      })
    )
})

export const joinStore = (adapter: DBAdapter): JoinStore => ({
  code: async identifier =>
    found(
      await adapter.findOne<CodeRow>({
        model: MODELS.code,
        where: byId(identifier)
      }),
      toCode
    ),
  room: async id =>
    found(
      await adapter.findOne<RoomRow>({ model: MODELS.room, where: byId(id) }),
      toRoom
    ),
  membership: async (roomId, actorId) =>
    found(
      await adapter.findOne<MemberRow>({
        model: MODELS.member,
        where: [
          { field: 'roomId', value: roomId },
          { field: 'actorId', value: actorId }
        ]
      }),
      toMembership
    ),
  admit: async (roomId, limit) =>
    (await adapter.incrementOne<RoomRow>({
      model: MODELS.room,
      where: capacityGuard(roomId, limit),
      increment: { memberCount: 1 }
    })) !== null,
  enroll: async member =>
    toMembership(
      await adapter.create<Input, MemberRow>({
        model: MODELS.member,
        data: {
          roomId: member.roomId,
          actorId: member.actorId,
          role: member.role,
          expiresAt: member.expiresAt
        }
      })
    ),
  reinstate: async membershipId => {
    const row = await adapter.update<MemberRow>({
      model: MODELS.member,
      where: byId(membershipId),
      update: { leftAt: null }
    })

    if (row === null) {
      throw new APIError('INTERNAL_SERVER_ERROR', {
        code: 'MEMBERSHIP_VANISHED',
        message: 'The membership disappeared while rejoining'
      })
    }

    return toMembership(row)
  }
})

export const attemptStore = (adapter: DBAdapter): AttemptStore => ({
  read: key =>
    adapter.findOne<Attempt>({ model: MODELS.attempt, where: byId(key) }),
  open: async (key, at) => {
    try {
      await adapter.create<Input, Attempt>({
        model: MODELS.attempt,
        data: { id: key, count: 1, lastAttemptAt: at },
        forceAllowId: true
      })

      return true
    } catch (error) {
      const existing = await adapter.findOne<Attempt>({
        model: MODELS.attempt,
        where: byId(key)
      })

      if (existing === null) throw error

      return false
    }
  },
  restart: async (key, unchangedSince, at) =>
    (await adapter.incrementOne<Attempt>({
      model: MODELS.attempt,
      where: [
        ...byId(key),
        { field: 'lastAttemptAt', operator: 'lte', value: unchangedSince }
      ],
      increment: {},
      set: { count: 1, lastAttemptAt: at }
    })) !== null,
  bump: async (key, after, at) =>
    (await adapter.incrementOne<Attempt>({
      model: MODELS.attempt,
      where: [
        ...byId(key),
        { field: 'lastAttemptAt', operator: 'gt', value: after }
      ],
      increment: { count: 1 },
      set: { lastAttemptAt: at }
    })) !== null,
  prune: async before => {
    await adapter.deleteMany({
      model: MODELS.attempt,
      where: [{ field: 'lastAttemptAt', operator: 'lt', value: before }]
    })
  }
})

const codeIssuer = (adapter: DBAdapter) => ({
  issueCode: async (identifier: string, roomId: string, at: Date) => {
    try {
      await adapter.create<Input, CodeRow>({
        model: MODELS.code,
        data: { id: identifier, roomId, status: 'active', createdAt: at },
        forceAllowId: true
      })

      return true
    } catch (error) {
      const taken = await adapter.findOne<CodeRow>({
        model: MODELS.code,
        where: byId(identifier)
      })

      if (taken === null) throw error

      return false
    }
  }
})

export const creationStore = (adapter: DBAdapter): CreationStore => ({
  ...codeIssuer(adapter),
  openRoom: async room =>
    toRoom(
      await adapter.create<Input, RoomRow>({
        model: MODELS.room,
        data: {
          createdBy: room.createdBy,
          maxMembers: room.maxMembers,
          expiresAt: room.expiresAt
        }
      })
    )
})

export const rotationStore = (adapter: DBAdapter): RotationStore => ({
  ...codeIssuer(adapter),
  room: async id =>
    found(
      await adapter.findOne<RoomRow>({ model: MODELS.room, where: byId(id) }),
      toRoom
    ),
  retireGrace: async (roomId, at) => {
    await adapter.updateMany({
      model: MODELS.code,
      where: [
        { field: 'roomId', value: roomId },
        { field: 'status', value: 'grace' }
      ],
      update: { status: 'revoked', revokedAt: at }
    })
  },
  demoteOthers: async (roomId, issuedAt, until) => {
    await adapter.updateMany({
      model: MODELS.code,
      where: [
        { field: 'roomId', value: roomId },
        { field: 'status', value: 'active' },
        { field: 'createdAt', operator: 'lt', value: issuedAt }
      ],
      update: { status: 'grace', expiresAt: until }
    })
  }
})

export const additionStore = (adapter: DBAdapter): AdditionStore => {
  const joins = joinStore(adapter)

  return {
    room: joins.room,
    membership: joins.membership,
    admit: joins.admit,
    enroll: joins.enroll
  }
}

export const accessStore = (adapter: DBAdapter): AccessStore => {
  const joins = joinStore(adapter)

  return { room: joins.room, membership: joins.membership }
}

const standing = (actorId: string): Where[] => [
  { field: 'actorId', value: actorId },
  { field: 'leftAt', value: null },
  { field: 'revokedAt', value: null }
]

const byRecency = (
  left: readonly Membership[],
  right: readonly Membership[]
): Membership[] => {
  const merged: Membership[] = []
  let fromLeft = 0
  let fromRight = 0

  while (merged.length < HELD_CEILING) {
    const head = left[fromLeft]
    const rival = right[fromRight]

    if (head === undefined) {
      if (rival === undefined) break

      merged.push(rival)
      fromRight++
    } else if (
      rival === undefined ||
      head.joinedAt.getTime() >= rival.joinedAt.getTime()
    ) {
      merged.push(head)
      fromLeft++
    } else {
      merged.push(rival)
      fromRight++
    }
  }

  return merged
}

export const membershipsStore = (adapter: DBAdapter): MembershipsStore => ({
  held: async (actorId, now) => {
    const page = (where: Where[]) =>
      adapter.findMany<MemberRow>({
        model: MODELS.member,
        where,
        sortBy: { field: 'joinedAt', direction: 'desc' },
        limit: HELD_CEILING
      })

    const [perpetual, dated] = await Promise.all([
      page([...standing(actorId), { field: 'expiresAt', value: null }]),
      page([
        ...standing(actorId),
        { field: 'expiresAt', operator: 'gt', value: now }
      ])
    ])

    const memberships = byRecency(
      perpetual.map(toMembership),
      dated.map(toMembership)
    )

    return {
      memberships,
      complete:
        perpetual.length < HELD_CEILING &&
        dated.length < HELD_CEILING &&
        memberships.length === perpetual.length + dated.length
    }
  },
  rooms: async ids =>
    (
      await adapter.findMany<RoomRow>({
        model: MODELS.room,
        where: [{ field: 'id', operator: 'in', value: ids }],
        limit: ids.length
      })
    ).map(toRoom)
})
