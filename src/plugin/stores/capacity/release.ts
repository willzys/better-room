import { found, toMembership } from '@/plugin/stores/rows'
import { memberTable, roomTable } from '@/plugin/stores/table'
import { byId, lapsedBy, OCCUPIED, REVOKED } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type {
  ReclaimStore,
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

export const reclaimStore = (adapter: DBAdapter): ReclaimStore => {
  const members = memberTable(adapter)

  const claiming = async (
    membershipId: string,
    at: Date,
    still: Clause<MemberRow>[]
  ) =>
    found(
      await members.incrementOne({
        where: [...byId(membershipId), OCCUPIED, ...still],
        increment: { occupancy: -1 },
        set: { releasedAt: at }
      }),
      toMembership
    )

  const reclaim = async (membershipId: string, at: Date) =>
    (await claiming(membershipId, at, lapsedBy(at))) ??
    claiming(membershipId, at, [REVOKED])

  return { reclaim, lowerCount: lowering(adapter) }
}
