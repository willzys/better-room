import type { Membership } from '@/core/membership'

export type ReleaseStore = {
  readonly endOccupancy: (membershipId: string, at: Date) => Promise<boolean>
  readonly lowerCount: (roomId: string) => Promise<void>
}

export const release = async (
  membership: Pick<Membership, 'id' | 'roomId'>,
  at: Date,
  store: ReleaseStore
): Promise<boolean> => {
  if (!(await store.endOccupancy(membership.id, at))) return false

  await store.lowerCount(membership.roomId)

  return true
}
