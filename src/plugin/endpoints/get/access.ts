import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { findActor } from '@/core/actor'
import { readAccess } from '@/core/operations/reads/access'
import { unknownRoomError } from '@/plugin/errors/refusals'
import { carriersFrom, isServerCall } from '@/plugin/http/carrier'
import { isStoredId } from '@/plugin/http/identifiers'
import { membershipReport, roomReport } from '@/plugin/http/report'
import { actorStore } from '@/plugin/stores/identity/actor'
import { accessStore } from '@/plugin/stores/reads/access'

const accessQuery = z.object({
  roomId: z.string().meta({ description: 'The room whose access is reported' })
})

const HIDDEN = { authorized: false, room: null, membership: null } as const

export const accessEndpoint = () =>
  createAuthEndpoint(
    '/better-room/access',
    { method: 'GET', query: accessQuery },
    async ctx => {
      const now = new Date()
      const { adapter, options } = ctx.context
      const fromServer = isServerCall(ctx)

      if (!isStoredId(options, ctx.query.roomId)) {
        if (fromServer) throw unknownRoomError()

        return ctx.json(HIDDEN)
      }

      const actor = await findActor(
        await carriersFrom(ctx, now),
        actorStore(adapter)
      )

      const access = await readAccess(
        { roomId: ctx.query.roomId, actor, now },
        accessStore(adapter)
      )

      if (!access.found && fromServer) throw unknownRoomError()

      const visible = access.found && (fromServer || access.related)

      if (!visible) {
        return ctx.json(HIDDEN)
      }

      return ctx.json({
        authorized: access.authorized,
        room: roomReport(access.room),
        membership: access.held === null ? null : membershipReport(access.held)
      })
    }
  )
