import { byId, MODELS, OCCUPIED } from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type { ReleaseStore } from '@/core/operations/capacity/release'
import type { MemberRow, RoomRow } from '@/plugin/stores/rows'

export const lowering = (adapter: DBAdapter) => async (roomId: string) => {
  await adapter.incrementOne<RoomRow>({
    model: MODELS.room,
    where: [
      ...byId(roomId),
      { field: 'memberCount', operator: 'gt', value: 0 }
    ],
    increment: { memberCount: -1 }
  })
}

export const releaseStore = (adapter: DBAdapter): ReleaseStore => ({
  endOccupancy: async (membershipId, at, withdrawal) =>
    (await adapter.incrementOne<MemberRow>({
      model: MODELS.member,
      where: [...byId(membershipId), OCCUPIED],
      increment: { occupancy: -1 },
      set:
        withdrawal === 'left'
          ? { releasedAt: at, leftAt: at }
          : { releasedAt: at }
    })) !== null,
  lowerCount: lowering(adapter)
})
