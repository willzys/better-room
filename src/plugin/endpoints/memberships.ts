import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api'

import { findActor } from '@/core/actor'
import { readMemberships } from '@/core/operations/memberships'
import { carriersOf, GRANT_COOKIE } from '@/plugin/carrier'
import { membershipReport, roomReport } from '@/plugin/report'
import { actorStore, membershipsStore } from '@/plugin/store'

export const membershipsEndpoint = () =>
  createAuthEndpoint(
    '/better-room/memberships',
    { method: 'GET' },
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

      const listed = await readMemberships(
        { actor, now },
        membershipsStore(adapter)
      )

      return ctx.json({
        memberships: listed.held.map(entry => ({
          membership: membershipReport(entry.membership),
          room: roomReport(entry.room)
        })),
        complete: listed.complete
      })
    }
  )
