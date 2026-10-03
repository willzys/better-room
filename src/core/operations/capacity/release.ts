import type { Membership } from '@/core/membership'

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
  if (!(await store.endOccupancy(membership.id, at, withdrawal))) return false

  await store.lowerCount(membership.roomId)

  return true
}
