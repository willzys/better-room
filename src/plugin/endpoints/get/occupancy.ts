import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { findActor } from '@/core/actor'
import { readOccupancy } from '@/core/operations/reads/occupancy'
import { carriersFrom } from '@/plugin/carrier'
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
      const { adapter } = ctx.context
      const actor = await findActor(
        await carriersFrom(ctx, now),
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
