import type { Absent, Pending, Perpetual } from '@/types/absence'

export type Membership = {
  id: string
  roomId: string
  actorId: string
  role: string
  joinedAt: Date
  expiresAt: Perpetual<Date>
  leftAt: Pending<Date>
  revokedAt: Pending<Date>
}

export const occupies = (membership: Membership, now: Date) =>
  membership.leftAt === null &&
  membership.revokedAt === null &&
  (membership.expiresAt === null || membership.expiresAt > now)

export const hasLapsed = (membership: Membership, now: Date) =>
  membership.leftAt === null &&
  membership.revokedAt === null &&
  membership.expiresAt !== null &&
  membership.expiresAt <= now

export type MembershipRefusal = 'membership-expired' | 'revoked'

export const membershipRefusal = (
  membership: Membership,
  now: Date
): MembershipRefusal | Absent => {
  if (membership.revokedAt !== null) return 'revoked'

  if (membership.expiresAt !== null && membership.expiresAt <= now) {
    return 'membership-expired'
  }

  return null
}
