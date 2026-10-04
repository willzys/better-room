import { eraseActor } from '@/core/operations/identity/erasure'
import { actorStore } from '@/plugin/stores/identity/actor'
import { erasureStore } from '@/plugin/stores/identity/erasure'

import type { BetterAuthOptions, DBAdapter } from 'better-auth/types'

type DatabaseHooks = NonNullable<BetterAuthOptions['databaseHooks']>

export const erasureHooks = (fallback: DBAdapter): DatabaseHooks => {
  const erasing = new WeakMap<object, string>()

  return {
    user: {
      delete: {
        before: async (user, endpoint) => {
          const actor = await actorStore(
            endpoint?.context.adapter ?? fallback
          ).byUser(user.id)

          if (actor !== null) erasing.set(user, actor.id)
        },
        after: async (user, endpoint) => {
          const actorId = erasing.get(user)

          if (actorId === undefined) return

          await eraseActor(
            { actorId, now: new Date() },
            erasureStore(endpoint?.context.adapter ?? fallback)
          )
        }
      }
    }
  }
}
