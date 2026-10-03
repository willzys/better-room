import { accessStore } from '@/plugin/stores/reads/access'
import { MODELS } from '@/plugin/stores/rows'

import type { DBAdapter, Where } from 'better-auth/types'

import type { OccupancyStore } from '@/core/operations/reads/occupancy'

const standing = (roomId: string): Where[] => [
  { field: 'roomId', value: roomId },
  { field: 'leftAt', value: null },
  { field: 'revokedAt', value: null }
]

export const occupancyStore = (adapter: DBAdapter): OccupancyStore => ({
  ...accessStore(adapter),
  occupied: async (roomId, now) => {
    const [perpetual, dated] = await Promise.all([
      adapter.count({
        model: MODELS.member,
        where: [...standing(roomId), { field: 'expiresAt', value: null }]
      }),
      adapter.count({
        model: MODELS.member,
        where: [
          ...standing(roomId),
          { field: 'expiresAt', operator: 'gt', value: now }
        ]
      })
    ])

    return perpetual + dated
  }
})
