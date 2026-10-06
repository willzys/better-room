import { isBlocked, isExhausted, recordAttempt } from '@/core/attempt'

import type { AttemptLimit, AttemptStore } from '@/core/attempt'
import type { Usable } from '@/types/absence'

const GLOBAL_KEY = 'global'

export type AttemptBudgets = {
  readonly perIp: AttemptLimit
  readonly everyone: AttemptLimit
}

export type AttemptRequest = {
  readonly ip: Usable<string>
  readonly budgets: AttemptBudgets
  readonly now: Date
}

const addressKey = (ip: string) => `ip:${ip}`

const chargedBudgets = (request: AttemptRequest) =>
  request.ip === null
    ? [{ key: GLOBAL_KEY, limit: request.budgets.everyone }]
    : [
        { key: GLOBAL_KEY, limit: request.budgets.everyone },
        { key: addressKey(request.ip), limit: request.budgets.perIp }
      ]

export const isThrottled = async (
  request: AttemptRequest,
  store: AttemptStore
): Promise<boolean> => {
  if (request.ip === null) {
    return isExhausted(
      await store.read(GLOBAL_KEY),
      request.budgets.everyone,
      request.now
    )
  }

  const [mine, everyone] = await Promise.all([
    store.read(addressKey(request.ip)),
    store.read(GLOBAL_KEY)
  ])

  return isBlocked({ mine, everyone }, request.budgets, request.now)
}

export const chargeFailure = async (
  request: AttemptRequest,
  store: AttemptStore
): Promise<string[]> => {
  const recorded = await Promise.all(
    chargedBudgets(request).map(async budget => ({
      key: budget.key,
      counted: await recordAttempt(
        { key: budget.key, limit: budget.limit, now: request.now },
        store
      )
    }))
  )

  return recorded.filter(budget => !budget.counted).map(budget => budget.key)
}
