import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { recountCapacity } from '@/core/operations/capacity/recount'
import { recountError } from '@/plugin/errors/refusals'
import { isStoredId } from '@/plugin/http/identifiers'
import { recountReport } from '@/plugin/http/report'
import { recountStore } from '@/plugin/stores/capacity/recount'

const recountBody = z.object({
  roomId: z
    .string()
    .meta({ description: 'The locked room whose seats are counted' })
})

export const recountEndpoint = () =>
  createAuthEndpoint.serverOnly(
    { method: 'POST', body: recountBody },
    async ctx => {
      if (!isStoredId(ctx.context.options, ctx.body.roomId)) {
        throw recountError('unknown-room')
      }

      const outcome = await recountCapacity(
        { roomId: ctx.body.roomId },
        recountStore(ctx.context.adapter)
      )

      if (!outcome.recounted) throw recountError(outcome.refusal)

      return ctx.json(recountReport(outcome))
    }
  )
