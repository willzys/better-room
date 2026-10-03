import { byId, MODELS, found, toActor } from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type { ActorStore } from '@/core/actor'
import type { ActorRow, Input } from '@/plugin/stores/rows'
import type { Unlinked } from '@/types/absence'

export const actorStore = (adapter: DBAdapter): ActorStore => ({
  byId: async id =>
    found(
      await adapter.findOne<ActorRow>({
        model: MODELS.actor,
        where: byId(id)
      }),
      toActor
    ),
  byUser: async userId =>
    found(
      await adapter.findOne<ActorRow>({
        model: MODELS.actor,
        where: [{ field: 'userId', value: userId }]
      }),
      toActor
    ),
  create: async (userId: Unlinked<string>) => {
    try {
      return toActor(
        await adapter.create<Input, ActorRow>({
          model: MODELS.actor,
          data: { userId }
        })
      )
    } catch (error) {
      if (userId === null) throw error

      const linked = await adapter.findOne<ActorRow>({
        model: MODELS.actor,
        where: [{ field: 'userId', value: userId }]
      })

      if (linked === null) throw error

      return toActor(linked)
    }
  }
})
