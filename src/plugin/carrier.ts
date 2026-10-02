import { decodeGrant, isLive } from '@/security/grant'

import type { ActorCarriers, ActorClaim } from '@/core/actor'
import type { Usable } from '@/types/absence'

export const GRANT_COOKIE = 'room_grant'

type SessionCarrier = {
  readonly user: { readonly id: string }
}

const claimOf = (signed: unknown, now: Date): Usable<ActorClaim> => {
  if (typeof signed !== 'string') return null

  const grant = decodeGrant(signed)

  if (grant === null || !isLive(grant, now)) return null

  return { actorId: grant.actorId, epoch: grant.epoch }
}

export const carriersOf = (
  signed: unknown,
  session: Usable<SessionCarrier>,
  now: Date
): ActorCarriers => ({
  userId: session?.user.id ?? null,
  claim: claimOf(signed, now)
})
