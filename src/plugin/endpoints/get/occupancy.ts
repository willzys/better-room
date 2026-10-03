import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api'
import * as z from 'zod'

import { findActor } from '@/core/actor'
import { readOccupancy } from '@/core/operations/reads/occupancy'
import { carriersOf, GRANT_COOKIE } from '@/plugin/carrier'
import { occupancyError } from '@/plugin/errors'
import { occupancyReport } from '@/plugin/report'
import { actorStore } from '@/plugin/stores/identity/actor'
import { occupancyStore } from '@/plugin/stores/reads/occupancy'

const occupancyQuery = z.object({
  roomId: z.string().meta({ description: 'The room whose occupancy is read' })
})

export const occupancyEndpoint = () =>
  createAuthEndpoint(
    '/better-room/occupancy',
    { method: 'GET', query: occupancyQuery },
    async ctx => {
      const now = new Date()
      const { adapter, secret } = ctx.context
      const cookie = ctx.context.createAuthCookie(GRANT_COOKIE)

      const [signed, session] = await Promise.all([
        ctx.getSignedCookie(cookie.name, secret),
        getSessionFromCtx(ctx)
      ])

      const actor = await findActor(
        carriersOf(signed, session, now),
        actorStore(adapter)
      )

      const outcome = await readOccupancy(
        {
          roomId: ctx.query.roomId,
          actor,
          fromServer: ctx.request === undefined,
          now
        },
        occupancyStore(adapter)
      )

      if (!outcome.read) throw occupancyError(outcome.refusal)

      return ctx.json(occupancyReport(outcome))
    }
  )
