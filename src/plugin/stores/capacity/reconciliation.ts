import { releaseStore } from '@/plugin/stores/capacity/release'
import { MODELS, OCCUPIED, toMembership } from '@/plugin/stores/rows'

import type { DBAdapter, Where } from 'better-auth/types'

import type { Membership } from '@/core/membership'
import type { ReconciliationStore } from '@/core/operations/capacity/reconciliation'
import type { MemberRow } from '@/plugin/stores/rows'

export const reconciliationStore = (
  adapter: DBAdapter
): ReconciliationStore => ({
  ...releaseStore(adapter),
  owing: async (now, batch) => {
    const owing = (where: Where[]) =>
      adapter.findMany<MemberRow>({
        model: MODELS.member,
        where: [OCCUPIED, ...where],
        limit: batch
      })

    const pages = await Promise.all([
      owing([{ field: 'expiresAt', operator: 'lte', value: now }]),
      owing([{ field: 'leftAt', operator: 'ne', value: null }]),
      owing([{ field: 'revokedAt', operator: 'ne', value: null }])
    ])

    const seen = new Map<string, Membership>()

    for (const page of pages) {
      for (const row of page) {
        if (seen.size >= batch) break

        seen.set(row.id, toMembership(row))
      }
    }

    return [...seen.values()]
  }
})
