import { roomLookup } from '@/plugin/stores/lookups'
import { found, toRoom } from '@/plugin/stores/rows'
import { roomTable } from '@/plugin/stores/table'
import { byId } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { LifecycleStore } from '@/core/operations/rooms/lifecycle'
import type { RoomStatus } from '@/core/room'

export const lifecycleStore = (adapter: DBAdapter): LifecycleStore => {
  const rooms = roomTable(adapter)

  const settle = async (roomId: string, status: RoomStatus) => {
    const settled = await rooms.update({
      where: [
        ...byId(roomId),
        { field: 'status', operator: 'ne', value: 'closed' }
      ],
      set: { status }
    })

    return found(settled, toRoom)
  }

  return { room: roomLookup(adapter), settle }
}
