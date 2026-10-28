import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { findActor } from '@/core/actor'
import { renameMember } from '@/core/operations/identity/naming'
import { namingError } from '@/plugin/errors/refusals'
import { carriersFrom } from '@/plugin/http/carrier'
import { concealed } from '@/plugin/http/concealment'
import { displayNameField } from '@/plugin/http/display-name'
import { isStoredId } from '@/plugin/http/identifiers'
import { membershipReport } from '@/plugin/http/report'
import { actorStore } from '@/plugin/stores/identity/actor'
import { namingStore } from '@/plugin/stores/identity/naming'

import type { Signal } from '@/plugin/hooks/events'

const renameBody = z.object({
  roomId: z.string().meta({ description: 'The room the caller is named in' }),
  name: displayNameField
    .nullable()
    .meta({ description: 'The name shown in that room, or null for none' })
})

export const renameEndpoint = (signal: Signal) =>
  createAuthEndpoint(
    '/better-room/rename',
    { method: 'POST', body: renameBody },
    async ctx => {
      const now = new Date()
      const { adapter } = ctx.context

      if (!isStoredId(ctx.context.options, ctx.body.roomId)) {
        throw namingError(concealed('unknown-room', ctx))
      }

      const actor = await findActor(
        await carriersFrom(ctx, now),
        actorStore(adapter)
      )

      const outcome = await renameMember(
        { roomId: ctx.body.roomId, actor, displayName: ctx.body.name, now },
        namingStore(adapter)
      )

      if (!outcome.named) throw namingError(concealed(outcome.refusal, ctx))

      const membership = membershipReport(outcome.membership)

      if (outcome.changed) {
        await signal(
          { type: 'renamed', roomId: membership.roomId, membership },
          ctx.context.logger
        )
      }

      return ctx.json({ membership })
    }
  )
