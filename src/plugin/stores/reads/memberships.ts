import { toRoom } from '@/plugin/stores/rows'
import { standingPage } from '@/plugin/stores/standing'
import { roomTable } from '@/plugin/stores/table'

import type { DBAdapter } from 'better-auth/types'

import type {
  MembershipsStore,
  Resumption
} from '@/core/operations/reads/memberships'
import type { Unstarted } from '@/types/absence'

export const membershipsStore = (adapter: DBAdapter): MembershipsStore => {
  const roomRows = roomTable(adapter)

  const held = (
    actorId: string,
    now: Date,
    before: Unstarted<Resumption>,
    ceiling: number
  ) =>
    standingPage(
      adapter,
      {
        owner: { field: 'actorId', value: actorId },
        key: 'roomId',
        now,
        ceiling
      },
      before
    )

  const rooms = async (ids: string[]) => {
    const rows = await roomRows.findMany({
      where: [{ field: 'id', operator: 'in', value: ids }],
      limit: ids.length
    })

    return rows.map(toRoom)
  }

  return { held, rooms }
}
