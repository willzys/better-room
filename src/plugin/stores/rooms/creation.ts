import { codeStore } from '@/plugin/stores/codes/code'
import { toRoom } from '@/plugin/stores/rows'
import { roomTable } from '@/plugin/stores/table'

import type { DBAdapter } from 'better-auth/types'

import type { CreationStore } from '@/core/operations/rooms/creation'

export const creationStore = (adapter: DBAdapter): CreationStore => {
  const rooms = roomTable(adapter)

  return {
    ...codeStore(adapter),
    openRoom: async room =>
      toRoom(
        await rooms.create({
          createdBy: room.createdBy,
          maxMembers: room.maxMembers,
          expiresAt: room.expiresAt
        })
      )
  }
}
