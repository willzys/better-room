import { codeIssuer } from '@/plugin/stores/codes/code'
import { MODELS, toRoom } from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type { CreationStore } from '@/core/operations/rooms/creation'
import type { Input, RoomRow } from '@/plugin/stores/rows'

export const creationStore = (adapter: DBAdapter): CreationStore => ({
  ...codeIssuer(adapter),
  openRoom: async room =>
    toRoom(
      await adapter.create<Input, RoomRow>({
        model: MODELS.room,
        data: {
          createdBy: room.createdBy,
          maxMembers: room.maxMembers,
          expiresAt: room.expiresAt
        }
      })
    )
})
