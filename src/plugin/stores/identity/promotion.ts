import { joinStore } from '@/plugin/stores/admission/join'
import { releaseStore } from '@/plugin/stores/capacity/release'
import { actorStore } from '@/plugin/stores/identity/actor'
import {
  byId,
  HELD_CEILING,
  MODELS,
  pairing,
  toMembership
} from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type { PromotionStore } from '@/core/operations/identity/promotion'
import type { ActorRow, MemberRow } from '@/plugin/stores/rows'

export const promotionStore = (adapter: DBAdapter): PromotionStore => {
  const actors = actorStore(adapter)
  const joins = joinStore(adapter)

  return {
    ...releaseStore(adapter),
    byId: actors.byId,
    owner: async userId =>
      (await actors.byUser(userId)) ?? (await actors.create(userId)),
    invalidate: async (actorId, epoch) =>
      (await adapter.incrementOne<ActorRow>({
        model: MODELS.actor,
        where: [...byId(actorId), { field: 'grantEpoch', value: epoch }],
        increment: { grantEpoch: 1 }
      })) !== null,
    heldBy: async actorId =>
      (
        await adapter.findMany<MemberRow>({
          model: MODELS.member,
          where: [{ field: 'actorId', value: actorId }],
          limit: HELD_CEILING
        })
      ).map(toMembership),
    membership: joins.membership,
    reassign: async (membershipId, roomId, actorId) => {
      try {
        return (
          (await adapter.update<MemberRow>({
            model: MODELS.member,
            where: byId(membershipId),
            update: { actorId }
          })) !== null
        )
      } catch (error) {
        const moved = await adapter.findOne<MemberRow>({
          model: MODELS.member,
          where: byId(membershipId)
        })

        if (moved?.actorId === actorId) return true

        const taken = await adapter.findOne<MemberRow>({
          model: MODELS.member,
          where: pairing(roomId, actorId)
        })

        if (taken === null) throw error

        return false
      }
    },
    discard: async membershipId => {
      await adapter.delete({ model: MODELS.member, where: byId(membershipId) })
    },
    forget: async actorId => {
      await adapter.delete({ model: MODELS.actor, where: byId(actorId) })
    }
  }
}
