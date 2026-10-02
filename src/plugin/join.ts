import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api'
import * as z from 'zod'

import type { ActorClaim } from '@/core/actor'
import { resolveActor } from '@/core/actor'
import { join } from '@/core/join'
import { refusalError } from '@/plugin/errors'
import { actorStore, joinStore } from '@/plugin/store'
import type { CodeIdentifier } from '@/security/code-identifier'
import { decodeGrant, encodeGrant, isLive } from '@/security/grant'
import type { Usable } from '@/types/absence'

const GRANT_COOKIE = 'room_grant'

const joinBody = z.object({
  code: z.string().meta({ description: 'The room code being presented' })
})

type JoinDeps = {
  readonly identify: (secret: string) => CodeIdentifier
  readonly grantLifetime: number
}

const claimOf = (signed: unknown, now: Date): Usable<ActorClaim> => {
  if (typeof signed !== 'string') return null

  const grant = decodeGrant(signed)

  if (grant === null || !isLive(grant, now)) return null

  return { actorId: grant.actorId, epoch: grant.epoch }
}

export const joinEndpoint = (deps: JoinDeps) =>
  createAuthEndpoint(
    '/room/join',
    { method: 'POST', body: joinBody },
    async ctx => {
      const now = new Date()
      const { adapter, secret } = ctx.context
      const identifier = await deps.identify(secret)(ctx.body.code)

      if (identifier === null) throw refusalError('unresolved')

      const cookie = ctx.context.createAuthCookie(GRANT_COOKIE, {
        maxAge: deps.grantLifetime
      })

      const outcome = await join(
        {
          codeIdentifier: identifier,
          now,
          actor: async () => {
            const [signed, session] = await Promise.all([
              ctx.getSignedCookie(cookie.name, secret),
              getSessionFromCtx(ctx)
            ])

            return resolveActor(
              {
                userId: session?.user.id ?? null,
                claim: claimOf(signed, now)
              },
              actorStore(adapter)
            )
          }
        },
        joinStore(adapter)
      )

      if (!outcome.admitted) throw refusalError(outcome.refusal)

      if (outcome.actor.userId === null) {
        await ctx.setSignedCookie(
          cookie.name,
          encodeGrant({
            actorId: outcome.actor.id,
            epoch: outcome.actor.grantEpoch,
            expiresAt: now.getTime() + deps.grantLifetime * 1000
          }),
          secret,
          cookie.attributes
        )
      }

      return ctx.json({ membership: outcome.membership })
    }
  )
