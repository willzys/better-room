import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { resolveActor } from '@/core/actor'
import {
  chargeFailure,
  isThrottled,
  releaseAttempt,
  reserveAttempt
} from '@/core/operations/admission/attempt'
import { join } from '@/core/operations/admission/join'
import {
  tooManyAttemptsError,
  joinError,
  joinNeedsASessionError
} from '@/plugin/errors/refusals'
import { addressOf } from '@/plugin/http/address'
import { carriersFrom, GRANT_COOKIE } from '@/plugin/http/carrier'
import { membershipReport } from '@/plugin/http/report'
import { attemptStore } from '@/plugin/stores/admission/attempt'
import { joinStore } from '@/plugin/stores/admission/join'
import { actorStore } from '@/plugin/stores/identity/actor'
import { encodeGrant } from '@/security/grant'

import type { Actor } from '@/core/actor'
import type { AttemptStore } from '@/core/attempt'
import type {
  AttemptBudgets,
  AttemptRequest,
  Reservation
} from '@/core/operations/admission/attempt'
import type { JoinRefusal } from '@/core/operations/admission/join'
import type { Signal } from '@/plugin/hooks/events'
import type { CodeIdentifier } from '@/security/code-identifier'
import type { KeyedDigest } from '@/security/keyed-digest'

const joinBody = z.object({
  code: z.string().meta({ description: 'The room code being presented' })
})

type JoinDeps = AttemptBudgets & {
  readonly identify: (secret: string) => CodeIdentifier
  readonly locate: (secret: string) => KeyedDigest
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

const charge = async (
  request: AttemptRequest,
  store: AttemptStore,
  logger: Reporter,
  reservation: Reservation
) => {
  for (const key of await chargeFailure(request, store, reservation)) {
    logger.warn(
      `better-room could not count a failed attempt against ${key}; its budget is under contention`
    )
  }
}

type Accounting = {
  readonly attempt: AttemptRequest
  readonly attempts: AttemptStore
  readonly logger: Reporter
  readonly reservation: Reservation
}

const refusing = (accounting: Accounting) => async (refusal: JoinRefusal) => {
  const { attempt, attempts, logger, reservation } = accounting

  if (refusal === 'unresolved') {
    await charge(attempt, attempts, logger, reservation)
  } else {
    await releaseAttempt(attempt, attempts, reservation)
  }

  return joinError(refusal)
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
        address: await addressOf(
          ctx.request ?? ctx.headers,
          ctx.context.options,
          deps.locate(secret)
        ),
        budgets: deps,
        now
      }

      if (await isThrottled(attempt, attempts)) throw tooManyAttemptsError()

      const reservation = await reserveAttempt(attempt, attempts)

      if (reservation === 'over') throw tooManyAttemptsError()

      const refused = refusing({ attempt, attempts, logger, reservation })

      const identifiers = await deps.identify(secret)(ctx.body.code)

      if (identifiers === null) throw await refused('unresolved')

      const outcome = await join(
        {
          codeIdentifiers: [identifiers.current, identifiers.legacy],
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

      await releaseAttempt(attempt, attempts, reservation)

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
