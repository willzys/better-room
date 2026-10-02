import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { resolveActor } from '@/core/actor'
import { addMember } from '@/core/addition'
import { additionError, additionServerOnlyError } from '@/plugin/errors'
import { actorStore, additionStore } from '@/plugin/store'

const addBody = z.object({
  roomId: z.string().meta({ description: 'The room the member is added to' }),
  userId: z
    .string()
    .meta({ description: 'The user whose actor becomes a member' }),
  role: z
    .string()
    .meta({ description: 'The role the membership carries, named by the app' }),
  expiresAt: z.coerce
    .date()
    .optional()
    .meta({ description: 'When the membership expires, never when absent' })
})

export const addEndpoint = () =>
  createAuthEndpoint(
    '/room/add-member',
    { method: 'POST', body: addBody },
    async ctx => {
      if (ctx.request !== undefined) throw additionServerOnlyError()

      const { adapter } = ctx.context
      const actor = await resolveActor(
        { userId: ctx.body.userId, claim: null },
        actorStore(adapter)
      )

      const outcome = await addMember(
        {
          roomId: ctx.body.roomId,
          actorId: actor.id,
          role: ctx.body.role,
          expiresAt: ctx.body.expiresAt ?? null,
          now: new Date()
        },
        additionStore(adapter)
      )

      if (!outcome.added) throw additionError(outcome.refusal)

      return ctx.json({ membership: outcome.membership })
    }
  )
