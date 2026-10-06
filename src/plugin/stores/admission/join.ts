import { seatingStore } from '@/plugin/stores/admission/seating'
import { membershipLookup, roomLookup } from '@/plugin/stores/lookups'
import { found, toCode } from '@/plugin/stores/rows'
import { codeTable } from '@/plugin/stores/table'
import { byIdentifier } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { JoinStore } from '@/core/operations/admission/join'

export const joinStore = (adapter: DBAdapter): JoinStore => {
  const codes = codeTable(adapter)

  const code = async (identifier: string) =>
    found(await codes.findOne(byIdentifier(identifier)), toCode)

  return {
    ...seatingStore(adapter),
    code,
    room: roomLookup(adapter),
    membership: membershipLookup(adapter)
  }
}
