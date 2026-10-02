import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api'

import { promote } from '@/core/operations/promotion'
import { carriersOf, GRANT_COOKIE } from '@/plugin/carrier'
import {
  noGrantToPromoteError,
  promotionError,
  promotionNeedsASessionError
} from '@/plugin/errors'
import { promotionStore } from '@/plugin/store'

export const promoteEndpoint = () =>
  createAuthEndpoint('/better-room/promote', { method: 'POST' }, async ctx => {
    const now = new Date()
    const { adapter, secret } = ctx.context
    const cookie = ctx.context.createAuthCookie(GRANT_COOKIE)

    const [signed, session] = await Promise.all([
      ctx.getSignedCookie(cookie.name, secret),
      getSessionFromCtx(ctx)
    ])

    if (session === null) throw promotionNeedsASessionError()

    const carriers = carriersOf(signed, session, now)

    if (carriers.claim === null) throw noGrantToPromoteError()

    const outcome = await promote(
      {
        userId: session.user.id,
        claim: carriers.claim,
        now
      },
      promotionStore(adapter)
    )

    if (!outcome.promoted) throw promotionError(outcome.refusal)

    await ctx.setSignedCookie(cookie.name, '', secret, {
      ...cookie.attributes,
      maxAge: 0
    })

    return ctx.json({
      actorId: outcome.actor.id,
      carried: outcome.carried,
      discarded: outcome.discarded
    })
  })
