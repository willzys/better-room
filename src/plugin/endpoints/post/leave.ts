import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api'
import * as z from 'zod'

import { findActor } from '@/core/actor'
import { leave } from '@/core/operations/capacity/leave'
import { carriersOf, GRANT_COOKIE } from '@/plugin/carrier'
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

      const outcome = await leave(
        { roomId: ctx.body.roomId, actor, now },
        leaveStore(adapter)
      )

      if (!outcome.left) throw leaveError(outcome.refusal)

      return ctx.json({ membership: membershipReport(outcome.membership) })
    }
  )
