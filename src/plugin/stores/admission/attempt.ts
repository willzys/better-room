import { byId, MODELS } from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type { Attempt, AttemptStore } from '@/core/attempt'
import type { Input } from '@/plugin/stores/rows'

export const attemptStore = (adapter: DBAdapter): AttemptStore => ({
  read: key =>
    adapter.findOne<Attempt>({ model: MODELS.attempt, where: byId(key) }),
  open: async (key, at) => {
    try {
      await adapter.create<Input, Attempt>({
        model: MODELS.attempt,
        data: { id: key, count: 1, lastAttemptAt: at },
        forceAllowId: true
      })

      return true
    } catch (error) {
      const existing = await adapter.findOne<Attempt>({
        model: MODELS.attempt,
        where: byId(key)
      })

      if (existing === null) throw error

      return false
    }
  },
  restart: async (key, unchangedSince, at) =>
    (await adapter.incrementOne<Attempt>({
      model: MODELS.attempt,
      where: [
        ...byId(key),
        { field: 'lastAttemptAt', operator: 'lte', value: unchangedSince }
      ],
      increment: {},
      set: { count: 1, lastAttemptAt: at }
    })) !== null,
  bump: async (key, after, at) =>
    (await adapter.incrementOne<Attempt>({
      model: MODELS.attempt,
      where: [
        ...byId(key),
        { field: 'lastAttemptAt', operator: 'gt', value: after }
      ],
      increment: { count: 1 },
      set: { lastAttemptAt: at }
    })) !== null,
  prune: async before => {
    await adapter.deleteMany({
      model: MODELS.attempt,
      where: [{ field: 'lastAttemptAt', operator: 'lt', value: before }]
    })
  }
})
