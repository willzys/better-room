import { relinquish } from '@/core/operations/capacity/release'

import type { Membership } from '@/core/membership'
import type { DiscardStore } from '@/core/operations/capacity/release'

export type ErasureStore = DiscardStore & {
  readonly heldBy: (actorId: string) => Promise<Membership[]>
  readonly disown: (actorId: string) => Promise<void>
  readonly forget: (actorId: string) => Promise<void>
}

export type ErasureRequest = {
  readonly actorId: string
  readonly now: Date
}

const drain = async (
  actorId: string,
  now: Date,
  store: ErasureStore
): Promise<void> => {
  const held = await store.heldBy(actorId)

  if (held.length === 0) return

  await Promise.all(held.map(membership => relinquish(membership, now, store)))

  return drain(actorId, now, store)
}

export const eraseActor = async (
  request: ErasureRequest,
  store: ErasureStore
): Promise<void> => {
  await drain(request.actorId, request.now, store)
  await store.disown(request.actorId)
  await store.forget(request.actorId)
}
