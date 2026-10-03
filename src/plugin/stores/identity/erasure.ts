import { promotionStore } from '@/plugin/stores/identity/promotion'
import { MODELS } from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type { ErasureStore } from '@/core/operations/identity/erasure'

export const erasureStore = (adapter: DBAdapter): ErasureStore => ({
  ...promotionStore(adapter),
  disown: async actorId => {
    await adapter.updateMany({
      model: MODELS.room,
      where: [{ field: 'createdBy', value: actorId }],
      update: { createdBy: null }
    })
  }
})
