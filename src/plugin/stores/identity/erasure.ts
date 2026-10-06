import { releaseStore } from '@/plugin/stores/capacity/release'
import { toMembership } from '@/plugin/stores/rows'
import { actorTable, memberTable, roomTable } from '@/plugin/stores/table'
import { byId } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { ErasureStore } from '@/core/operations/identity/erasure'

export const erasureStore = (adapter: DBAdapter): ErasureStore => {
  const actors = actorTable(adapter)
  const members = memberTable(adapter)
  const rooms = roomTable(adapter)

  const heldBy = async (actorId: string, limit: number) =>
    (
      await members.findMany({
        where: [{ field: 'actorId', value: actorId }],
        limit
      })
    ).map(toMembership)

  const discard = async (membershipId: string) => {
    await members.delete(byId(membershipId))
  }

  const disown = async (actorId: string) => {
    await rooms.updateMany({
      where: [{ field: 'createdBy', value: actorId }],
      set: { createdBy: null }
    })
  }

  const forget = async (actorId: string) => {
    await actors.delete(byId(actorId))
  }

  return { ...releaseStore(adapter), heldBy, discard, disown, forget }
}
