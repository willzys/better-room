import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { findActor } from '@/core/actor'
import { readMembers } from '@/core/operations/reads/members'
import { membersError, unreadableCursorError } from '@/plugin/errors/refusals'
import { carriersFrom, isServerCall } from '@/plugin/http/carrier'
import { concealed } from '@/plugin/http/concealment'
import { readCursor, writeCursor } from '@/plugin/http/cursor'
import { isStoredId } from '@/plugin/http/identifiers'
import { memberReport } from '@/plugin/http/report'
import { actorStore } from '@/plugin/stores/identity/actor'
import { membersStore } from '@/plugin/stores/reads/members'

const membersQuery = z.object({
  roomId: z.string().meta({ description: 'The room whose members are listed' }),
  before: z.string().optional().meta({
    description: 'Continue a partial listing from the next it returned'
  })
})

export const membersEndpoint = () =>
  createAuthEndpoint(
    '/better-room/members',
    { method: 'GET', query: membersQuery },
    async ctx => {
      const now = new Date()
      const { adapter, options } = ctx.context
      const { roomId, before: cursor } = ctx.query
      const isKey = (id: string) => isStoredId(options, id)

      if (!isKey(roomId)) throw membersError(concealed('unknown-room', ctx))

      const before = cursor === undefined ? null : readCursor(cursor, isKey)

      if (cursor !== undefined && before === null) {
        throw unreadableCursorError()
      }

      const actor = await findActor(
        await carriersFrom(ctx, now),
        actorStore(adapter)
      )

      const outcome = await readMembers(
        { roomId, actor, fromServer: isServerCall(ctx), before, now },
        membersStore(adapter)
      )

      if (!outcome.read) throw membersError(concealed(outcome.refusal, ctx))

      return ctx.json({
        members: outcome.members.map(memberReport),
        complete: outcome.complete,
        next: writeCursor(outcome.next)
      })
    }
  )
