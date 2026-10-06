import { eraseActor } from '@/core/operations/identity/erasure'
import { actorStore } from '@/plugin/stores/identity/actor'
import { erasureStore } from '@/plugin/stores/identity/erasure'

import type { BetterAuthOptions, DBAdapter } from 'better-auth/types'

import type { Signal } from '@/plugin/hooks/events'

type DatabaseHooks = NonNullable<BetterAuthOptions['databaseHooks']>

export const erasureHooks = (
  fallback: DBAdapter,
  signal: Signal,
  logger: Parameters<Signal>[1]
): DatabaseHooks => ({
  user: {
    delete: {
      after: async (user, endpoint) => {
        const adapter = endpoint?.context.adapter ?? fallback
        const actor = await actorStore(adapter).byUser(user.id)

        if (actor === null) return

        await eraseActor(
          { actorId: actor.id, now: new Date() },
          erasureStore(adapter)
        )
        await signal(
          { type: 'erased', actorId: actor.id },
          endpoint?.context.logger ?? logger
        )
      }
    }
  }
})
