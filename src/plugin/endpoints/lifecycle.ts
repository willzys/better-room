import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { settleRoom } from '@/core/operations/lifecycle'
import { lifecycleError, lifecycleServerOnlyError } from '@/plugin/errors'
import { roomReport } from '@/plugin/report'
import { lifecycleStore } from '@/plugin/store'

import type { Transition } from '@/core/operations/lifecycle'

const lifecycleBody = z.object({
  roomId: z.string().meta({ description: 'The room whose state changes' })
})

export const lifecycleEndpoint = (transition: Transition) =>
  createAuthEndpoint(
    `/better-room/${transition}`,
    { method: 'POST', body: lifecycleBody },
    async ctx => {
      if (ctx.request !== undefined) throw lifecycleServerOnlyError()

      const outcome = await settleRoom(
        { roomId: ctx.body.roomId, transition },
        lifecycleStore(ctx.context.adapter)
      )

      if (!outcome.settled) throw lifecycleError(outcome.refusal)

      return ctx.json({ room: roomReport(outcome.room) })
    }
  )
