import { attemptTable } from '@/plugin/stores/table'
import { staleBefore } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { PruningStore } from '@/core/operations/admission/pruning'

export const pruningStore = (adapter: DBAdapter): PruningStore => {
  const attempts = attemptTable(adapter)

  const expired = async (before: Date, page: number) => {
    const rows = await attempts.findMany({
      where: [staleBefore(before)],
      limit: page
    })

    return rows.map(row => row.key)
  }

  const discard = (keys: string[], before: Date) =>
    attempts.deleteMany([
      { field: 'key', operator: 'in', value: keys },
      staleBefore(before)
    ])

  return { expired, discard }
}
