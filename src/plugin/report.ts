import { EXPIRY_BRANCHES } from '@/core/operations/reads/memberships'

import type { Membership } from '@/core/membership'
import type { Reconciliation } from '@/core/operations/capacity/reconciliation'
import type { Promoted } from '@/core/operations/identity/promotion'
import type {
  ExpiryBranch,
  Resumption
} from '@/core/operations/reads/memberships'
import type { Occupied } from '@/core/operations/reads/occupancy'
import type { Room, RoomStatus } from '@/core/room'
import type {
  Exhausted,
  Pending,
  Perpetual,
  Unbounded,
  Resumable,
  Unlinked
} from '@/types/absence'

export type RoomReport = {
  readonly id: string
  readonly status: RoomStatus
  readonly memberCount: number
  readonly maxMembers: Unbounded<number>
  readonly expiresAt: Perpetual<Date>
  readonly createdBy: Unlinked<string>
  readonly createdAt: Date
}

export type OccupancyReport = {
  readonly roomId: string
  readonly occupied: number
  readonly maxMembers: Unbounded<number>
}

export type ReconciliationReport = {
  readonly owing: number
  readonly released: number
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

export const occupancyReport = (outcome: Occupied): OccupancyReport => ({
  roomId: outcome.room.id,
  occupied: outcome.occupied,
  maxMembers: outcome.room.maxMembers
})

export const reconciliationReport = (
  reconciliation: Reconciliation
): ReconciliationReport => ({
  owing: reconciliation.owing,
  released: reconciliation.released
})

export const promotionReport = (outcome: Promoted): PromotionReport => ({
  actorId: outcome.actor.id,
  merged: outcome.merged,
  carried: outcome.carried,
  discarded: outcome.discarded,
  complete: outcome.complete
})

const BRANCH_TAGS = {
  perpetual: 'p',
  dated: 'd'
} as const satisfies Record<ExpiryBranch, string>

export const resumptionReport = (
  resumption: Exhausted<Resumption>
): Exhausted<string> =>
  resumption === null
    ? null
    : `${BRANCH_TAGS[resumption.branch]}.${resumption.after ?? ''}`

export const readResumption = (text: string): Resumable<Resumption> => {
  const branch = EXPIRY_BRANCHES.find(name =>
    text.startsWith(`${BRANCH_TAGS[name]}.`)
  )

  if (branch === undefined) return null

  const after = text.slice(BRANCH_TAGS[branch].length + 1)

  return { branch, after: after === '' ? null : after }
}
