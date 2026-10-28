import { isBlocked, isExhausted, isPaced, recordAttempt } from '@/core/attempt'

import type { AttemptLimit, AttemptStore } from '@/core/attempt'
import type { Usable } from '@/types/absence'

const GLOBAL_KEY = 'global'

export type AttemptBudgets = {
  readonly perIp: AttemptLimit
  readonly everyone: AttemptLimit
  readonly progressive: boolean
  readonly reserve: boolean
}

export type AttemptRequest = {
  readonly address: Usable<string>
  readonly budgets: AttemptBudgets
  readonly now: Date
}

const addressKey = (address: string) => `address:${address}`

export type Reservation = 'held' | 'none' | 'over'

const chargedBudgets = (request: AttemptRequest, reserved: boolean) =>
  request.address === null || reserved
    ? [{ key: GLOBAL_KEY, limit: request.budgets.everyone }]
    : [
        { key: GLOBAL_KEY, limit: request.budgets.everyone },
        { key: addressKey(request.address), limit: request.budgets.perIp }
      ]

export const isThrottled = async (
  request: AttemptRequest,
  store: AttemptStore
): Promise<boolean> => {
  if (request.address === null) {
    return isExhausted(
      await store.read(GLOBAL_KEY),
      request.budgets.everyone,
      request.now
    )
  }

  const [mine, everyone] = await Promise.all([
    store.read(addressKey(request.address)),
    store.read(GLOBAL_KEY)
  ])

  const paced =
    request.budgets.progressive &&
    isPaced(mine, request.budgets.perIp, request.now)

  return paced || isBlocked({ mine, everyone }, request.budgets, request.now)
}

export const chargeFailure = async (
  request: AttemptRequest,
  store: AttemptStore,
  reservation: Reservation = 'none'
): Promise<string[]> => {
  const recorded = await Promise.all(
    chargedBudgets(request, reservation !== 'none').map(async budget => ({
      key: budget.key,
      counted: await recordAttempt(
        { key: budget.key, limit: budget.limit, now: request.now },
        store
      )
    }))
  )

  return recorded.filter(budget => !budget.counted).map(budget => budget.key)
}

export const reserveAttempt = async (
  request: AttemptRequest,
  store: AttemptStore
): Promise<Reservation> => {
  if (!request.budgets.reserve || request.address === null) return 'none'

  const key = addressKey(request.address)
  const limit = request.budgets.perIp
  const counted = await recordAttempt({ key, limit, now: request.now }, store)

  if (!counted) return 'none'

  const held = await store.read(key)

  return held !== null && held.count > limit.max ? 'over' : 'held'
}

export const releaseAttempt = async (
  request: AttemptRequest,
  store: AttemptStore,
  reservation: Reservation
) => {
  if (reservation !== 'held' || request.address === null) return false

  const floor = request.now.getTime() - request.budgets.perIp.window * 1000

  return store.refund(addressKey(request.address), new Date(floor))
}
