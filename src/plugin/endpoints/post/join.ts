import { createAuthEndpoint, getIP, getSessionFromCtx } from 'better-auth/api'
import * as z from 'zod'

import { resolveActor } from '@/core/actor'
import { isBlocked, isExhausted, recordAttempt } from '@/core/attempt'
import { join } from '@/core/operations/admission/join'
import { carriersOf, GRANT_COOKIE } from '@/plugin/carrier'
import { attemptError, refusalError } from '@/plugin/errors'
import { membershipReport } from '@/plugin/report'
import { attemptStore } from '@/plugin/stores/admission/attempt'
import { joinStore } from '@/plugin/stores/admission/join'
import { actorStore } from '@/plugin/stores/identity/actor'
import { encodeGrant } from '@/security/grant'

import type { BetterAuthOptions } from 'better-auth/types'

import type { Actor } from '@/core/actor'
import type { AttemptLimit, AttemptStore } from '@/core/attempt'
import type { CodeIdentifier } from '@/security/code-identifier'
import type { Usable } from '@/types/absence'

const GLOBAL_KEY = 'global'

const joinBody = z.object({
  code: z.string().meta({ description: 'The room code being presented' })
})

type JoinDeps = {
  readonly identify: (secret: string) => CodeIdentifier
  readonly grantLifetime: number
  readonly perIp: AttemptLimit
  readonly everyone: AttemptLimit
}

type Budget = {
  readonly key: string
  readonly limit: AttemptLimit
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

const budgetsOf = (ip: Usable<string>, deps: JoinDeps): Budget[] =>
  ip === null
    ? [{ key: GLOBAL_KEY, limit: deps.everyone }]
    : [
        { key: GLOBAL_KEY, limit: deps.everyone },
        { key: `ip:${ip}`, limit: deps.perIp }
      ]

const blocked = async (
  ip: Usable<string>,
  deps: JoinDeps,
  store: AttemptStore,
  now: Date
) => {
  if (ip === null) {
    return isExhausted(await store.read(GLOBAL_KEY), deps.everyone, now)
  }

  const [mine, everyone] = await Promise.all([
    store.read(`ip:${ip}`),
    store.read(GLOBAL_KEY)
  ])

  return isBlocked(
    { mine, everyone },
    { perIp: deps.perIp, everyone: deps.everyone },
    now
  )
}

type Reporter = {
  readonly warn: (message: string) => void
}

const count = async (
  budgets: Budget[],
  store: AttemptStore,
  now: Date,
  logger: Reporter
) => {
  const recorded = await Promise.all(
    budgets.map(async budget => ({
      key: budget.key,
      counted: await recordAttempt(
        { key: budget.key, limit: budget.limit, now },
        store
      )
    }))
  )

  for (const budget of recorded) {
    if (!budget.counted) {
      logger.warn(
        `better-room could not count a failed attempt against ${budget.key}; its budget is under contention`
      )
    }
  }
}

export const joinEndpoint = (deps: JoinDeps) =>
  createAuthEndpoint(
    '/better-room/join',
    { method: 'POST', body: joinBody },
    async ctx => {
      const now = new Date()
      const { adapter, secret } = ctx.context
      const attempts = attemptStore(adapter)
      const ip = addressOf(ctx.request ?? ctx.headers, ctx.context.options)
      const budgets = budgetsOf(ip, deps)

      if (await blocked(ip, deps, attempts, now)) throw attemptError()

      const identifier = await deps.identify(secret)(ctx.body.code)

      if (identifier === null) {
        await count(budgets, attempts, now, ctx.context.logger)

        throw refusalError('unresolved')
      }

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
              carriersOf(signed, session, now),
              actorStore(adapter)
            )
          }
        },
        joinStore(adapter)
      )

      if (!outcome.admitted) {
        if (outcome.refusal === 'unresolved') {
          await count(budgets, attempts, now, ctx.context.logger)
        }

        throw refusalError(outcome.refusal)
      }

      if (outcome.actor.userId === null) {
        await ctx.setSignedCookie(
          cookie.name,
          grantFor(outcome.actor, deps.grantLifetime, now),
          secret,
          cookie.attributes
        )
      }

      return ctx.json({ membership: membershipReport(outcome.membership) })
    }
  )
