import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { revokeMember } from '@/core/operations/capacity/revocation'
import { revocationError, revocationServerOnlyError } from '@/plugin/errors'
import { membershipReport } from '@/plugin/report'
import { revocationStore } from '@/plugin/stores/capacity/revocation'

const revokeBody = z.object({
  roomId: z
    .string()
    .meta({ description: 'The room the membership belongs to' }),
  actorId: z
    .string()
    .meta({ description: 'The actor whose membership is withdrawn' })
})

export const revokeEndpoint = () =>
  createAuthEndpoint(
    '/better-room/revoke-member',
    { method: 'POST', body: revokeBody },
    async ctx => {
      if (ctx.request !== undefined) throw revocationServerOnlyError()

      const outcome = await revokeMember(
        {
          roomId: ctx.body.roomId,
          actorId: ctx.body.actorId,
          now: new Date()
        },
        revocationStore(ctx.context.adapter)
      )

      if (!outcome.revoked) throw revocationError(outcome.refusal)

      return ctx.json({ membership: membershipReport(outcome.membership) })
    }
  )
