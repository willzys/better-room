import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { findActor } from '@/core/actor'
import { readAccess } from '@/core/operations/reads/access'
import { carriersFrom } from '@/plugin/carrier'
import { unknownRoomError } from '@/plugin/errors'
import { membershipReport, roomReport } from '@/plugin/report'
import { actorStore } from '@/plugin/stores/identity/actor'
import { accessStore } from '@/plugin/stores/reads/access'

const accessQuery = z.object({
  roomId: z.string().meta({ description: 'The room whose access is reported' })
})

export const accessEndpoint = () =>
  createAuthEndpoint(
    '/better-room/access',
    { method: 'GET', query: accessQuery },
    async ctx => {
      const now = new Date()
      const { adapter } = ctx.context
      const actor = await findActor(
        await carriersFrom(ctx, now),
        actorStore(adapter)
      )

      const access = await readAccess(
        { roomId: ctx.query.roomId, actor, now },
        accessStore(adapter)
      )

      if (!access.found) throw unknownRoomError()

      return ctx.json({
        authorized: access.authorized,
        room: roomReport(access.room),
        membership: access.held === null ? null : membershipReport(access.held)
      })
    }
  )
