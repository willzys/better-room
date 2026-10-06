import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { findActor } from '@/core/actor'
import { leave } from '@/core/operations/capacity/leave'
import { leaveError } from '@/plugin/errors/refusals'
import { carriersFrom } from '@/plugin/http/carrier'
import { membershipReport } from '@/plugin/http/report'
import { leaveStore } from '@/plugin/stores/capacity/leave'
import { actorStore } from '@/plugin/stores/identity/actor'

import type { Signal } from '@/plugin/hooks/events'

const leaveBody = z.object({
  roomId: z.string().meta({ description: 'The room the caller withdraws from' })
})

export const leaveEndpoint = (signal: Signal) =>
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

      const membership = membershipReport(outcome.membership)

      if (outcome.changed) {
        await signal(
          { type: 'left', roomId: membership.roomId, membership },
          ctx.context.logger
        )
      }

      return ctx.json({ membership })
    }
  )
