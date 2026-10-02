import type { Usable } from '@/types/absence'

const MAX_RETRIES = 3

export type Attempt = {
  id: string
  count: number
  lastAttemptAt: Date
}

export type AttemptLimit = {
  readonly max: number
  readonly window: number
}

export type AttemptStore = {
  readonly read: (key: string) => Promise<Usable<Attempt>>
  readonly open: (key: string, at: Date) => Promise<boolean>
  readonly restart: (
    key: string,
    unchangedSince: Date,
    at: Date
  ) => Promise<boolean>
  readonly bump: (key: string, after: Date, at: Date) => Promise<boolean>
  readonly prune: (before: Date) => Promise<void>
}

const elapsed = (attempt: Attempt, limit: AttemptLimit, now: Date) =>
  now.getTime() - attempt.lastAttemptAt.getTime() >= limit.window * 1000

const live = (attempt: Usable<Attempt>, limit: AttemptLimit, now: Date) =>
  attempt !== null && !elapsed(attempt, limit, now)

export const isExhausted = (
  attempt: Usable<Attempt>,
  limit: AttemptLimit,
  now: Date
) => live(attempt, limit, now) && (attempt?.count ?? 0) >= limit.max

export const isBlocked = (
  counted: {
    readonly mine: Usable<Attempt>
    readonly everyone: Usable<Attempt>
  },
  limits: { readonly perIp: AttemptLimit; readonly everyone: AttemptLimit },
  now: Date
) =>
  isExhausted(counted.mine, limits.perIp, now) ||
  (isExhausted(counted.everyone, limits.everyone, now) &&
    live(counted.mine, limits.perIp, now))

const tryRecord = async (
  request: { key: string; limit: AttemptLimit; now: Date },
  store: AttemptStore,
  retries: number
): Promise<void> => {
  if (retries === 0) return

  const floor = new Date(request.now.getTime() - request.limit.window * 1000)
  const existing = await store.read(request.key)

  if (existing === null) {
    if (await store.open(request.key, request.now)) return

    return tryRecord(request, store, retries - 1)
  }

  if (elapsed(existing, request.limit, request.now)) {
    if (await store.restart(request.key, existing.lastAttemptAt, request.now)) {
      return store.prune(floor)
    }

    return tryRecord(request, store, retries - 1)
  }

  await store.bump(request.key, floor, request.now)
}

export const recordAttempt = (
  request: { key: string; limit: AttemptLimit; now: Date },
  store: AttemptStore
) => tryRecord(request, store, MAX_RETRIES)
