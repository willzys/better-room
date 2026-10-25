import { memberTable, roomTable } from '@/plugin/stores/table'
import { byId, lapsedBy, OCCUPIED, REVOKED } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type {
  ReleaseStore,
  Withdrawal
} from '@/core/operations/capacity/release'
import type { MemberRow } from '@/plugin/stores/rows'
import type { Clause } from '@/plugin/stores/where'

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

  const ending = async (
    membershipId: string,
    at: Date,
    withdrawal: Withdrawal,
    still: Clause<MemberRow>[]
  ) => {
    const ended = await members.incrementOne({
      where: [...byId(membershipId), OCCUPIED, ...still],
      increment: { occupancy: -1 },
      set:
        withdrawal === 'left'
          ? { releasedAt: at, leftAt: at }
          : { releasedAt: at }
    })

    return ended !== null
  }

  const endOccupancy = async (
    membershipId: string,
    at: Date,
    withdrawal: Withdrawal
  ) => {
    if (withdrawal !== 'owed') {
      return ending(membershipId, at, withdrawal, [])
    }

    const lapsed = await ending(membershipId, at, withdrawal, lapsedBy(at))

    return lapsed || ending(membershipId, at, withdrawal, [REVOKED])
  }

  return { endOccupancy, lowerCount: lowering(adapter) }
}
