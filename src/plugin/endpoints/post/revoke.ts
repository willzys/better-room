import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { revokeMember } from '@/core/operations/capacity/revocation'
import { revocationError } from '@/plugin/errors/refusals'
import { membershipReport } from '@/plugin/http/report'
import { revocationStore } from '@/plugin/stores/capacity/revocation'

import type { Signal } from '@/plugin/hooks/events'

const revokeBody = z.object({
  roomId: z
    .string()
    .meta({ description: 'The room the membership belongs to' }),
  actorId: z
    .string()
    .meta({ description: 'The actor whose membership is withdrawn' })
})

export const revokeEndpoint = (signal: Signal) =>
  createAuthEndpoint.serverOnly(
    { method: 'POST', body: revokeBody },
    async ctx => {
      const outcome = await revokeMember(
        {
          roomId: ctx.body.roomId,
          actorId: ctx.body.actorId,
          now: new Date()
        },
        revocationStore(ctx.context.adapter)
      )

      if (!outcome.revoked) throw revocationError(outcome.refusal)

      const membership = membershipReport(outcome.membership)

      await signal(
        { type: 'revoked', roomId: membership.roomId, membership },
        ctx.context.logger
      )

      return ctx.json({ membership })
    }
  )
