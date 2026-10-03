import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api'
import * as z from 'zod'

import { promote } from '@/core/operations/promotion'
import { carriersOf, GRANT_COOKIE } from '@/plugin/carrier'
import {
  noGrantToPromoteError,
  promotionError,
  promotionNeedsASessionError,
  resumeIsServerOnlyError,
  resumeNeedsBothNamesError
} from '@/plugin/errors'
import { promotionReport } from '@/plugin/report'
import { promotionStore } from '@/plugin/store'

const promoteBody = z
  .object({
    actorId: z.string().optional().meta({
      description: 'The anonymous actor to merge, server side only'
    }),
    userId: z.string().optional().meta({
      description: 'The user the actor merges into, server side only'
    })
  })
  .optional()

export const promoteEndpoint = () =>
  createAuthEndpoint(
    '/better-room/promote',
    { method: 'POST', body: promoteBody },
    async ctx => {
      const now = new Date()
      const { adapter, secret } = ctx.context
      const named = ctx.body?.actorId

      if (named !== undefined) {
        if (ctx.request !== undefined) throw resumeIsServerOnlyError()

        const userId = ctx.body?.userId

        if (userId === undefined) throw resumeNeedsBothNamesError()

        const resumed = await promote(
          { userId, actorId: named, authority: { kind: 'server' }, now },
          promotionStore(adapter)
        )

        if (!resumed.promoted) throw promotionError(resumed.refusal)

        return ctx.json(promotionReport(resumed))
      }

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
          actorId: carriers.claim.actorId,
          authority: { kind: 'grant', epoch: carriers.claim.epoch },
          now
        },
        promotionStore(adapter)
      )

      if (!outcome.promoted) throw promotionError(outcome.refusal)

      await ctx.setSignedCookie(cookie.name, '', secret, {
        ...cookie.attributes,
        maxAge: 0
      })

      return ctx.json(promotionReport(outcome))
    }
  )
