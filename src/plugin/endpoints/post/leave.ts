import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { findActor } from '@/core/actor'
import { leave } from '@/core/operations/capacity/leave'
import { carriersFrom } from '@/plugin/carrier'
import { leaveError } from '@/plugin/errors'
import { membershipReport } from '@/plugin/report'
import { leaveStore } from '@/plugin/stores/capacity/leave'
import { actorStore } from '@/plugin/stores/identity/actor'

const leaveBody = z.object({
  roomId: z.string().meta({ description: 'The room the caller withdraws from' })
})

export const leaveEndpoint = () =>
  createAuthEndpoint(
    '/better-room/leave',
    { method: 'POST', body: leaveBody },
    async ctx => {
      const now = new Date()
      const { adapter } = ctx.context
      const actor = await findActor(
        await carriersFrom(ctx, now),
        actorStore(adapter)
      )

      const outcome = await leave(
        { roomId: ctx.body.roomId, actor, now },
        leaveStore(adapter)
      )

      if (!outcome.left) throw leaveError(outcome.refusal)

      return ctx.json({ membership: membershipReport(outcome.membership) })
    }
  )
