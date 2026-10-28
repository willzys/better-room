import { codeTable } from '@/plugin/stores/table'

import type { DBAdapter } from 'better-auth/types'

import type { RetirementStore } from '@/core/operations/codes/retirement'
import type { CodeRow } from '@/plugin/stores/rows'
import type { Clause } from '@/plugin/stores/where'

export const retirementStore = (adapter: DBAdapter): RetirementStore => {
  const codes = codeTable(adapter)

  const matching = async (where: Clause<CodeRow>[], page: number) =>
    (await codes.findMany({ where, limit: page })).map(row => row.id)

  const spent = async (now: Date, page: number) => {
    const [revoked, lapsed] = await Promise.all([
      matching([{ field: 'status', value: 'revoked' }], page),
      matching([{ field: 'expiresAt', operator: 'lte', value: now }], page)
    ])

    return [...new Set([...revoked, ...lapsed])].slice(0, page)
  }

  const discard = (ids: string[]) =>
    codes.deleteMany([{ field: 'id', operator: 'in', value: ids }])

  return { spent, discard }
}
