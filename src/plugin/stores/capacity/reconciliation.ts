import { releaseStore } from '@/plugin/stores/capacity/release'
import { toMembership } from '@/plugin/stores/rows'
import { memberTable } from '@/plugin/stores/table'
import { OCCUPIED } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { Membership } from '@/core/membership'
import type { ReconciliationStore } from '@/core/operations/capacity/reconciliation'
import type { MemberRow } from '@/plugin/stores/rows'
import type { Clause } from '@/plugin/stores/where'

export const reconciliationStore = (
  adapter: DBAdapter
): ReconciliationStore => {
  const members = memberTable(adapter)

  const owing = async (now: Date, batch: number) => {
    const holding = (where: Clause<MemberRow>[]) =>
      members.findMany({ where: [OCCUPIED, ...where], limit: batch })

    const pages = await Promise.all([
      holding([{ field: 'expiresAt', operator: 'lte', value: now }]),
      holding([{ field: 'revokedAt', operator: 'ne', value: null }])
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

  return { ...releaseStore(adapter), owing }
}
