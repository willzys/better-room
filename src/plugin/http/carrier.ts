import { getSessionFromCtx } from 'better-auth/api'

import { findActor, seatDeadline } from '@/core/actor'
import { actorStore } from '@/plugin/stores/identity/actor'
import { decodeGrant, encodeGrant, isLive } from '@/security/grant'

import type { GenericEndpointContext } from '@better-auth/core'
import type { APIError } from 'better-auth/api'

import type {
  Actor,
  ActorCarriers,
  ActorClaim,
  ActorSource
} from '@/core/actor'
import type { Unbounded, Usable } from '@/types/absence'

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

export type GrantTerms = {
  readonly lifetime: number
  readonly seatLifetime: Unbounded<number>
}

export const issueGrant = async (
  ctx: GenericEndpointContext,
  actor: Actor,
  terms: GrantTerms,
  now: Date
) => {
  const until =
    seatDeadline(actor, terms.seatLifetime) ??
    new Date(now.getTime() + terms.lifetime * 1000)
  const cookie = ctx.context.createAuthCookie(GRANT_COOKIE, {
    maxAge: Math.floor((until.getTime() - now.getTime()) / 1000)
  })
  const grant = encodeGrant({
    actorId: actor.id,
    epoch: actor.grantEpoch,
    expiresAt: until.getTime()
  })

  await ctx.setSignedCookie(
    cookie.name,
    grant,
    ctx.context.secret,
    cookie.attributes
  )
}

export const actorSource = (
  ctx: GenericEndpointContext,
  now: Date,
  sessionRefusal: Usable<() => Promise<APIError>>
): ActorSource => {
  const actors = actorStore(ctx.context.adapter)
  let carried: Promise<ActorCarriers> | undefined

  const resolve = async () => {
    const carriers = await carriersFrom(ctx, now)

    if (sessionRefusal !== null && carriers.userId === null) {
      throw await sessionRefusal()
    }

    return carriers
  }

  const carriers = () => (carried ??= resolve())

  return {
    find: async () => findActor(await carriers(), actors),
    create: async () => actors.create((await carriers()).userId)
  }
}
