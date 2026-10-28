import type { Membership } from '@/core/membership'
import type { Usable } from '@/types/absence'

export type Withdrawal = 'left' | 'none'

export type ReleaseStore = {
  readonly endOccupancy: (
    membershipId: string,
    at: Date,
    withdrawal: Withdrawal
  ) => Promise<boolean>
  readonly lowerCount: (roomId: string) => Promise<void>
}

export const release = async (
  membership: Pick<Membership, 'id' | 'roomId'>,
  at: Date,
  store: ReleaseStore,
  withdrawal: Withdrawal
): Promise<boolean> => {
  const ended = await store.endOccupancy(membership.id, at, withdrawal)

  if (!ended) return false

  await store.lowerCount(membership.roomId)

  return true
}

export type ReclaimStore = {
  readonly reclaim: (
    membershipId: string,
    at: Date
  ) => Promise<Usable<Membership>>
  readonly lowerCount: (roomId: string) => Promise<void>
}

export const reclaim = async (
  membership: Pick<Membership, 'id' | 'roomId'>,
  at: Date,
  store: ReclaimStore
): Promise<Usable<Membership>> => {
  const reclaimed = await store.reclaim(membership.id, at)

  if (reclaimed === null) return null

  await store.lowerCount(membership.roomId)

  return reclaimed
}

export type DiscardStore = ReleaseStore & {
  readonly discard: (membershipId: string) => Promise<void>
}

export const relinquish = async (
  membership: Pick<Membership, 'id' | 'roomId'>,
  at: Date,
  store: DiscardStore
) => {
  await release(membership, at, store, 'none')
  await store.discard(membership.id)
}
