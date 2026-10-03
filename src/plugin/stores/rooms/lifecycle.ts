import { rotationStore } from '@/plugin/stores/codes/rotation'
import { byId, found, MODELS, toRoom } from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type { LifecycleStore } from '@/core/operations/rooms/lifecycle'
import type { RoomRow } from '@/plugin/stores/rows'

export const lifecycleStore = (adapter: DBAdapter): LifecycleStore => ({
  room: rotationStore(adapter).room,
  settle: async (roomId, status) =>
    found(
      await adapter.update<RoomRow>({
        model: MODELS.room,
        where: [
          ...byId(roomId),
          { field: 'status', operator: 'ne', value: 'closed' }
        ],
        update: { status }
      }),
      toRoom
    )
})
