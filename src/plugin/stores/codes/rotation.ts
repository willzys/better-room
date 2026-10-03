import { codeIssuer } from '@/plugin/stores/codes/code'
import { byId, found, MODELS, toRoom } from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type { RotationStore } from '@/core/operations/codes/rotation'
import type { CodeRow, RoomRow } from '@/plugin/stores/rows'

const ACTIVE_CODE_CEILING = 100

export const rotationStore = (adapter: DBAdapter): RotationStore => ({
  ...codeIssuer(adapter),
  room: async id =>
    found(
      await adapter.findOne<RoomRow>({ model: MODELS.room, where: byId(id) }),
      toRoom
    ),
  retireGrace: async (roomId, at) => {
    await adapter.updateMany({
      model: MODELS.code,
      where: [
        { field: 'roomId', value: roomId },
        { field: 'status', value: 'grace' }
      ],
      update: { status: 'revoked', revokedAt: at }
    })
  },
  activeCodes: async roomId =>
    (
      await adapter.findMany<CodeRow>({
        model: MODELS.code,
        where: [
          { field: 'roomId', value: roomId },
          { field: 'status', value: 'active' }
        ],
        limit: ACTIVE_CODE_CEILING
      })
    ).map(row => row.id),
  demoteOthers: async (roomId, codeIds, until) => {
    await adapter.updateMany({
      model: MODELS.code,
      where: [
        { field: 'roomId', value: roomId },
        { field: 'status', value: 'active' },
        { field: 'id', operator: 'in', value: codeIds }
      ],
      update: { status: 'grace', expiresAt: until }
    })
  }
})
