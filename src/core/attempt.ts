import type { Usable } from '@/types/absence'

const RECORD_ATTEMPTS = 3

export type Attempt = {
  key: string
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

type Recording = {
  readonly key: string
  readonly limit: AttemptLimit
  readonly now: Date
}

const floorOf = (request: Recording) =>
  new Date(request.now.getTime() - request.limit.window * 1000)

const recordOnce = async (
  request: Recording,
  store: AttemptStore
): Promise<boolean> => {
  const existing = await store.read(request.key)

  if (existing === null) return store.open(request.key, request.now)

  if (!elapsed(existing, request.limit, request.now)) {
    return store.bump(request.key, floorOf(request), request.now)
  }

  const restarted = await store.restart(
    request.key,
    existing.lastAttemptAt,
    request.now
  )

  if (restarted) await store.prune(floorOf(request))

  return restarted
}

const tryRecord = async (
  request: Recording,
  store: AttemptStore,
  attempts: number
): Promise<boolean> => {
  if (attempts === 0) return false

  const recorded = await recordOnce(request, store)

  return recorded || tryRecord(request, store, attempts - 1)
}

export const recordAttempt = (request: Recording, store: AttemptStore) =>
  tryRecord(request, store, RECORD_ATTEMPTS)
