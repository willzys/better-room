import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api'
import * as z from 'zod'

import { findActor } from '@/core/actor'
import { readAccess } from '@/core/operations/access'
import { carriersOf, GRANT_COOKIE } from '@/plugin/carrier'
import { unknownRoomError } from '@/plugin/errors'
import { membershipReport, roomReport } from '@/plugin/report'
import { accessStore, actorStore } from '@/plugin/store'

const accessQuery = z.object({
  roomId: z.string().meta({ description: 'The room whose access is reported' })
})

export const accessEndpoint = () =>
  createAuthEndpoint(
    '/better-room/access',
    { method: 'GET', query: accessQuery },
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
