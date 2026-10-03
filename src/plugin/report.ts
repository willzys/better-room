import type { Membership } from '@/core/membership'
import type { Promoted } from '@/core/operations/identity/promotion'
import type { Room, RoomStatus } from '@/core/room'
import type { Pending, Perpetual, Unbounded, Unlinked } from '@/types/absence'

export type RoomReport = {
  readonly id: string
  readonly status: RoomStatus
  readonly memberCount: number
  readonly maxMembers: Unbounded<number>
  readonly expiresAt: Perpetual<Date>
  readonly createdBy: Unlinked<string>
  readonly createdAt: Date
}

export type MembershipReport = {
  readonly id: string
  readonly roomId: string
  readonly actorId: string
  readonly role: string
  readonly joinedAt: Date
  readonly expiresAt: Perpetual<Date>
  readonly leftAt: Pending<Date>
  readonly revokedAt: Pending<Date>
}

export type PromotionReport = {
  readonly actorId: string
  readonly merged: string
  readonly carried: number
  readonly discarded: number
  readonly complete: boolean
}

export const roomReport = (room: Room): RoomReport => ({
  id: room.id,
  status: room.status,
  memberCount: room.memberCount,
  maxMembers: room.maxMembers,
  expiresAt: room.expiresAt,
  createdBy: room.createdBy,
  createdAt: room.createdAt
})

export const membershipReport = (membership: Membership): MembershipReport => ({
  id: membership.id,
  roomId: membership.roomId,
  actorId: membership.actorId,
  role: membership.role,
  joinedAt: membership.joinedAt,
  expiresAt: membership.expiresAt,
  leftAt: membership.leftAt,
  revokedAt: membership.revokedAt
})

export const promotionReport = (outcome: Promoted): PromotionReport => ({
  actorId: outcome.actor.id,
  merged: outcome.merged,
  carried: outcome.carried,
  discarded: outcome.discarded,
  complete: outcome.complete
})
