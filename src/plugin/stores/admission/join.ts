import { seatingStore } from '@/plugin/stores/admission/seating'
import { membershipLookup, roomLookup } from '@/plugin/stores/lookups'
import { found, toCode } from '@/plugin/stores/rows'
import { codeTable } from '@/plugin/stores/table'

import type { DBAdapter } from 'better-auth/types'

import type { JoinStore } from '@/core/operations/admission/join'

export const joinStore = (adapter: DBAdapter): JoinStore => {
  const codes = codeTable(adapter)

  const code = async (identifiers: readonly string[]) => {
    const rows = await codes.findMany({
      where: [{ field: 'identifier', operator: 'in', value: [...identifiers] }],
      limit: identifiers.length
    })
    const ranked = identifiers.map(identifier =>
      rows.find(row => row.identifier === identifier)
    )

    return found(ranked.find(row => row !== undefined) ?? null, toCode)
  }

  return {
    ...seatingStore(adapter),
    code,
    room: roomLookup(adapter),
    membership: membershipLookup(adapter)
  }
}
