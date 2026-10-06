import { relinquish } from '@/core/operations/capacity/release'

import type { Membership } from '@/core/membership'
import type { DiscardStore } from '@/core/operations/capacity/release'
import type { Usable } from '@/types/absence'

export type ErasureStore = DiscardStore & {
  readonly heldBy: (actorId: string, limit: number) => Promise<Membership[]>
  readonly disown: (actorId: string) => Promise<void>
  readonly forget: (actorId: string) => Promise<void>
}

export type ErasureRequest = {
  readonly actorId: string
  readonly now: Date
}

const DRAIN = { page: 200 } as const

export const FORGET_ATTEMPTS = 3

const drain = async (
  actorId: string,
  now: Date,
  store: DiscardStore & Pick<ErasureStore, 'heldBy'>,
  drained = 0
): Promise<number> => {
  const held = await store.heldBy(actorId, DRAIN.page)

  if (held.length === 0) return drained

  await Promise.all(held.map(membership => relinquish(membership, now, store)))

  return drain(actorId, now, store, drained + held.length)
}

export const forgetActor = async (
  actorId: string,
  now: Date,
  store: ErasureStore
): Promise<Usable<number>> => {
  try {
    await store.forget(actorId)
  } catch (error) {
    const held = await store.heldBy(actorId, 1)

    if (held.length === 0) throw error

    return null
  }

  return drain(actorId, now, store)
}

const retire = async (
  request: ErasureRequest,
  store: ErasureStore,
  attempts: number
): Promise<void> => {
  await drain(request.actorId, request.now, store)
  await store.disown(request.actorId)

  const forgotten = await forgetActor(request.actorId, request.now, store)

  if (forgotten !== null) return
  if (attempts === 0) {
    throw new Error(
      `better-room could not erase actor ${request.actorId}: memberships kept arriving while it drained`
    )
  }

  return retire(request, store, attempts - 1)
}

export const eraseActor = async (
  request: ErasureRequest,
  store: ErasureStore
): Promise<void> => {
  await retire(request, store, FORGET_ATTEMPTS)
  await store.disown(request.actorId)
}
