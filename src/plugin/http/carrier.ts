import { getSessionFromCtx } from 'better-auth/api'

import { decodeGrant, isLive } from '@/security/grant'

import type { GenericEndpointContext } from '@better-auth/core'

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

const carriersOf = (
  signed: unknown,
  session: Usable<SessionCarrier>,
  now: Date
): ActorCarriers => ({
  userId: session?.user.id ?? null,
  claim: claimOf(signed, now)
})

export const isServerCall = (ctx: Pick<GenericEndpointContext, 'request'>) =>
  ctx.request === undefined

export const carriersFrom = async (
  ctx: GenericEndpointContext,
  now: Date
): Promise<ActorCarriers> => {
  const cookie = ctx.context.createAuthCookie(GRANT_COOKIE)
  const [signed, session] = await Promise.all([
    ctx.getSignedCookie(cookie.name, ctx.context.secret),
    getSessionFromCtx(ctx)
  ])

  return carriersOf(signed, session, now)
}
