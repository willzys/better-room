import { accessStore } from '@/plugin/stores/reads/access'
import { memberTable } from '@/plugin/stores/table'

import type { DBAdapter } from 'better-auth/types'

import type { OccupancyStore } from '@/core/operations/reads/occupancy'
import type { MemberRow } from '@/plugin/stores/rows'
import type { Clause } from '@/plugin/stores/where'

const standing = (roomId: string): Clause<MemberRow>[] => [
  { field: 'roomId', value: roomId },
  { field: 'leftAt', value: null },
  { field: 'revokedAt', value: null }
]

export const occupancyStore = (adapter: DBAdapter): OccupancyStore => {
  const members = memberTable(adapter)

  const occupied = async (roomId: string, now: Date) => {
    const [perpetual, dated] = await Promise.all([
      members.count([...standing(roomId), { field: 'expiresAt', value: null }]),
      members.count([
        ...standing(roomId),
        { field: 'expiresAt', operator: 'gt', value: now }
      ])
    ])

    return perpetual + dated
  }

  return { ...accessStore(adapter), occupied }
}
