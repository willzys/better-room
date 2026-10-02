import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api'
import * as z from 'zod'

import { readAccess } from '@/core/access'
import { findActor } from '@/core/actor'
import { unknownRoomError } from '@/plugin/errors'
import { accessStore, actorStore } from '@/plugin/store'
import { decodeGrant, isLive } from '@/security/grant'

import type { ActorClaim } from '@/core/actor'
import type { Usable } from '@/types/absence'

const GRANT_COOKIE = 'room_grant'

const accessQuery = z.object({
  roomId: z.string().meta({ description: 'The room whose access is reported' })
})

const claimOf = (signed: unknown, now: Date): Usable<ActorClaim> => {
  if (typeof signed !== 'string') return null

  const grant = decodeGrant(signed)

  if (grant === null || !isLive(grant, now)) return null

  return { actorId: grant.actorId, epoch: grant.epoch }
}

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
        {
          userId: session?.user.id ?? null,
          claim: claimOf(signed, now)
        },
        actorStore(adapter)
      )

      const access = await readAccess(
        { roomId: ctx.query.roomId, actor, now },
        accessStore(adapter)
      )

      if (!access.found) throw unknownRoomError()

      return ctx.json({
        authorized: access.authorized,
        room: access.room,
        membership: access.held
      })
    }
  )
