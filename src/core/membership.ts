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
