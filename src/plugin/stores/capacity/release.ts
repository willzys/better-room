import { memberTable, roomTable } from '@/plugin/stores/table'
import { byId, OCCUPIED } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type {
  ReleaseStore,
  Withdrawal
} from '@/core/operations/capacity/release'

export const lowering = (adapter: DBAdapter) => {
  const rooms = roomTable(adapter)

  return async (roomId: string) => {
    await rooms.incrementOne({
      where: [
        ...byId(roomId),
        { field: 'memberCount', operator: 'gt', value: 0 }
      ],
      increment: { memberCount: -1 }
    })
  }
}

export const releaseStore = (adapter: DBAdapter): ReleaseStore => {
  const members = memberTable(adapter)

  const endOccupancy = async (
    membershipId: string,
    at: Date,
    withdrawal: Withdrawal
  ) => {
    const ended = await members.incrementOne({
      where: [...byId(membershipId), OCCUPIED],
      increment: { occupancy: -1 },
      set:
        withdrawal === 'left'
          ? { releasedAt: at, leftAt: at }
          : { releasedAt: at }
    })

    return ended !== null
  }

  return { endOccupancy, lowerCount: lowering(adapter) }
}
