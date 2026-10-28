import { roomLookup } from '@/plugin/stores/lookups'
import { memberTable, roomTable } from '@/plugin/stores/table'
import { byId, OCCUPIED } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { RecountStore } from '@/core/operations/capacity/recount'

export const recountStore = (adapter: DBAdapter): RecountStore => {
  const rooms = roomTable(adapter)
  const members = memberTable(adapter)

  const held = (roomId: string) =>
    members.count([{ field: 'roomId', value: roomId }, OCCUPIED])

  const settle = async (roomId: string, from: number, to: number) => {
    const settled = await rooms.incrementOne({
      where: [
        ...byId(roomId),
        { field: 'memberCount', value: from },
        { field: 'status', value: 'locked' }
      ],
      increment: {},
      set: { memberCount: to }
    })

    return settled !== null
  }

  return { room: roomLookup(adapter), held, settle }
}
