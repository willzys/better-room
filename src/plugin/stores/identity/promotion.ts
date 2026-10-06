import { writeOrConfirm } from '@/plugin/stores/collision'
import { actorStore } from '@/plugin/stores/identity/actor'
import { erasureStore } from '@/plugin/stores/identity/erasure'
import { membershipLookup, survivalLookup } from '@/plugin/stores/lookups'
import { actorTable, memberTable } from '@/plugin/stores/table'
import { byId } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { PromotionStore } from '@/core/operations/identity/promotion'

export const promotionStore = (adapter: DBAdapter): PromotionStore => {
  const actors = actorStore(adapter)
  const actorRows = actorTable(adapter)
  const members = memberTable(adapter)
  const membership = membershipLookup(adapter)

  const owner = async (userId: string) =>
    (await actors.byUser(userId)) ?? (await actors.create(userId))

  const invalidate = async (actorId: string, epoch: number) => {
    const invalidated = await actorRows.incrementOne({
      where: [...byId(actorId), { field: 'grantEpoch', value: epoch }],
      increment: { grantEpoch: 1 }
    })

    return invalidated !== null
  }

  const reassign = (membershipId: string, roomId: string, actorId: string) =>
    writeOrConfirm(
      async () =>
        (await members.update({
          where: byId(membershipId),
          set: { actorId }
        })) !== null,
      async () => {
        const moved = await members.findOne(byId(membershipId))

        if (moved?.actorId === actorId) return true

        return (await membership(roomId, actorId)) === null ? null : false
      }
    )

  return {
    ...erasureStore(adapter),
    byId: actors.byId,
    owner,
    invalidate,
    survives: survivalLookup(adapter),
    membership,
    reassign
  }
}
