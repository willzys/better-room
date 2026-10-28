import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

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
import { actorSource, issueGrant } from '@/plugin/http/carrier'
import { disclosed } from '@/plugin/http/concealment'
import { displayNameField } from '@/plugin/http/display-name'
import { membershipReport } from '@/plugin/http/report'
import { attemptStore } from '@/plugin/stores/admission/attempt'
import { joinStore } from '@/plugin/stores/admission/join'
import { CODE } from '@/security/code-format'

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
  code: z
    .string()
    .max(CODE.maxInput)
    .meta({ description: 'The room code being presented' }),
  name: displayNameField
    .optional()
    .meta({ description: 'The name shown for the caller in this room' })
})

type JoinDeps = AttemptBudgets & {
  readonly identify: (secret: string) => CodeIdentifier
  readonly locate: (secret: string) => KeyedDigest
  readonly grantLifetime: number
  readonly requireSession: boolean
  readonly concealRefusals: boolean
  readonly expireAnonymousSeats: boolean
  readonly signal: Signal
}

type Reporter = {
  readonly warn: (message: string) => void
}

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

const refusing =
  (accounting: Accounting, conceal: boolean) =>
  async (refusal: JoinRefusal) => {
    const { attempt, attempts, logger, reservation } = accounting
    const shown = disclosed(refusal, conceal)

    if (shown === 'unresolved') {
      await charge(attempt, attempts, logger, reservation)
    } else {
      await releaseAttempt(attempt, attempts, reservation)
    }

    return joinError(shown)
  }

const seatLifetimeOf = (deps: JoinDeps) =>
  deps.expireAnonymousSeats ? deps.grantLifetime : null

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

      const accounting = { attempt, attempts, logger, reservation }
      const refused = refusing(accounting, deps.concealRefusals)

      const needsSession = async () =>
        deps.concealRefusals ? refused('unresolved') : joinNeedsASessionError()

      const identifiers = await deps.identify(secret)(ctx.body.code)

      if (identifiers === null) throw await refused('unresolved')

      const outcome = await join(
        {
          codeIdentifiers: [identifiers.current, identifiers.legacy],
          seatLifetime: seatLifetimeOf(deps),
          displayName: ctx.body.name ?? null,
          now,
          actor: actorSource(
            ctx,
            now,
            deps.requireSession ? needsSession : null
          )
        },
        joinStore(adapter)
      )

      if (!outcome.admitted) throw await refused(outcome.refusal)

      await releaseAttempt(attempt, attempts, reservation)

      if (outcome.actor.userId === null) {
        const terms = {
          lifetime: deps.grantLifetime,
          seatLifetime: seatLifetimeOf(deps)
        }

        await issueGrant(ctx, outcome.actor, terms, now)
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
