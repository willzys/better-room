import { createAuthEndpoint, getIP } from 'better-auth/api'
import * as z from 'zod'

import { resolveActor } from '@/core/actor'
import { chargeFailure, isThrottled } from '@/core/operations/admission/attempt'
import { join } from '@/core/operations/admission/join'
import {
  tooManyAttemptsError,
  joinError,
  joinNeedsASessionError
} from '@/plugin/errors/refusals'
import { carriersFrom, GRANT_COOKIE } from '@/plugin/http/carrier'
import { membershipReport } from '@/plugin/http/report'
import { attemptStore } from '@/plugin/stores/admission/attempt'
import { joinStore } from '@/plugin/stores/admission/join'
import { actorStore } from '@/plugin/stores/identity/actor'
import { encodeGrant } from '@/security/grant'

import type { BetterAuthOptions } from 'better-auth/types'

import type { Actor } from '@/core/actor'
import type { AttemptStore } from '@/core/attempt'
import type {
  AttemptBudgets,
  AttemptRequest
} from '@/core/operations/admission/attempt'
import type { JoinRefusal } from '@/core/operations/admission/join'
import type { Signal } from '@/plugin/hooks/events'
import type { CodeIdentifier } from '@/security/code-identifier'

const joinBody = z.object({
  code: z.string().meta({ description: 'The room code being presented' })
})

type JoinDeps = AttemptBudgets & {
  readonly identify: (secret: string) => CodeIdentifier
  readonly grantLifetime: number
  readonly requireSession: boolean
  readonly signal: Signal
}

type Reporter = {
  readonly warn: (message: string) => void
}

const grantFor = (actor: Actor, lifetime: number, now: Date) =>
  encodeGrant({
    actorId: actor.id,
    epoch: actor.grantEpoch,
    expiresAt: now.getTime() + lifetime * 1000
  })

const addressOf = (
  carrier: Headers | Request | undefined,
  options: BetterAuthOptions
) => (carrier === undefined ? null : getIP(carrier, options))

const charge = async (
  request: AttemptRequest,
  store: AttemptStore,
  logger: Reporter
) => {
  for (const key of await chargeFailure(request, store)) {
    logger.warn(
      `better-room could not count a failed attempt against ${key}; its budget is under contention`
    )
  }
}

export const joinEndpoint = (deps: JoinDeps) =>
  createAuthEndpoint(
    '/better-room/join',
    { method: 'POST', body: joinBody },
    async ctx => {
      const now = new Date()
      const { adapter, secret, logger } = ctx.context
      const attempts = attemptStore(adapter)
      const attempt: AttemptRequest = {
        ip: addressOf(ctx.request ?? ctx.headers, ctx.context.options),
        budgets: { perIp: deps.perIp, everyone: deps.everyone },
        now
      }

      const refused = async (refusal: JoinRefusal) => {
        if (refusal === 'unresolved') await charge(attempt, attempts, logger)

        return joinError(refusal)
      }

      if (await isThrottled(attempt, attempts)) throw tooManyAttemptsError()

      const identifier = await deps.identify(secret)(ctx.body.code)

      if (identifier === null) throw await refused('unresolved')

      const outcome = await join(
        {
          codeIdentifier: identifier,
          now,
          actor: async () => {
            const carriers = await carriersFrom(ctx, now)

            if (deps.requireSession && carriers.userId === null) {
              throw joinNeedsASessionError()
            }

            return resolveActor(carriers, actorStore(adapter))
          }
        },
        joinStore(adapter)
      )

      if (!outcome.admitted) throw await refused(outcome.refusal)

      if (outcome.actor.userId === null) {
        const cookie = ctx.context.createAuthCookie(GRANT_COOKIE, {
          maxAge: deps.grantLifetime
        })

        await ctx.setSignedCookie(
          cookie.name,
          grantFor(outcome.actor, deps.grantLifetime, now),
          secret,
          cookie.attributes
        )
      }

      const membership = membershipReport(outcome.membership)

      if (outcome.changed) {
        await deps.signal(
          { type: 'joined', roomId: membership.roomId, membership },
          logger
        )
      }

      return ctx.json({ membership })
    }
  )
