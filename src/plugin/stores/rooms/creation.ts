import { codeStore } from '@/plugin/stores/codes/code'
import { toRoom } from '@/plugin/stores/rows'
import { roomTable } from '@/plugin/stores/table'
import { byId } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { CreationStore } from '@/core/operations/rooms/creation'

export const creationStore = (adapter: DBAdapter): CreationStore => {
  const rooms = roomTable(adapter)

  const openRoom: CreationStore['openRoom'] = async room =>
    toRoom(
      await rooms.create({
        createdBy: room.createdBy,
        maxMembers: room.maxMembers,
        expiresAt: room.expiresAt
      })
    )

  const discardRoom = async (roomId: string) => {
    await rooms.delete(byId(roomId))
  }

  return { ...codeStore(adapter), openRoom, discardRoom }
}
