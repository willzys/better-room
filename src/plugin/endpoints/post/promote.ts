import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { promote } from '@/core/operations/identity/promotion'
import {
  noGrantToPromoteError,
  promotionError,
  promotionNeedsASessionError,
  resumeIsServerOnlyError,
  resumeNeedsBothNamesError
} from '@/plugin/errors/refusals'
import { carriersFrom, GRANT_COOKIE, isServerCall } from '@/plugin/http/carrier'
import { promotionReport } from '@/plugin/http/report'
import { promotionStore } from '@/plugin/stores/identity/promotion'

import type { GenericEndpointContext } from '@better-auth/core'

import type { Promoted } from '@/core/operations/identity/promotion'
import type { Signal } from '@/plugin/hooks/events'
import type { Usable } from '@/types/absence'

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

type Resumption = {
  readonly actorId: string
  readonly userId: string
}

const resumptionOf = (
  ctx: Pick<GenericEndpointContext, 'request'>,
  body: { actorId?: string | undefined; userId?: string | undefined } = {}
): Usable<Resumption> => {
  const server = isServerCall(ctx)

  if (body.actorId === undefined && (!server || body.userId === undefined)) {
    return null
  }
  if (!server) throw resumeIsServerOnlyError()
  if (body.actorId === undefined || body.userId === undefined) {
    throw resumeNeedsBothNamesError()
  }

  return { actorId: body.actorId, userId: body.userId }
}

const announced = async (
  promoted: Promoted,
  signal: Signal,
  logger: Parameters<Signal>[1]
) => {
  const report = promotionReport(promoted)

  await signal(
    { type: 'promoted', actorId: report.actorId, merged: report.merged },
    logger
  )

  return report
}

export const promoteEndpoint = (signal: Signal) =>
  createAuthEndpoint(
    '/better-room/promote',
    { method: 'POST', body: promoteBody },
    async ctx => {
      const now = new Date()
      const { adapter, secret } = ctx.context
      const resumption = resumptionOf(ctx, ctx.body)

      if (resumption !== null) {
        const resumed = await promote(
          { ...resumption, authority: { kind: 'server' }, now },
          promotionStore(adapter)
        )

        if (!resumed.promoted) throw promotionError(resumed.refusal)

        return ctx.json(await announced(resumed, signal, ctx.context.logger))
      }

      const carriers = await carriersFrom(ctx, now)

      if (carriers.userId === null) throw promotionNeedsASessionError()
      if (carriers.claim === null) throw noGrantToPromoteError()

      const outcome = await promote(
        {
          userId: carriers.userId,
          actorId: carriers.claim.actorId,
          authority: { kind: 'grant', epoch: carriers.claim.epoch },
          now
        },
        promotionStore(adapter)
      )

      if (!outcome.promoted) throw promotionError(outcome.refusal)

      const cookie = ctx.context.createAuthCookie(GRANT_COOKIE)

      await ctx.setSignedCookie(cookie.name, '', secret, {
        ...cookie.attributes,
        maxAge: 0
      })

      return ctx.json(await announced(outcome, signal, ctx.context.logger))
    }
  )
