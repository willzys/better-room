import { seatingStore } from '@/plugin/stores/admission/seating'
import { membershipLookup, roomLookup } from '@/plugin/stores/lookups'

import type { DBAdapter } from 'better-auth/types'

import type { AdditionStore } from '@/core/operations/admission/addition'

export const additionStore = (adapter: DBAdapter): AdditionStore => ({
  ...seatingStore(adapter),
  room: roomLookup(adapter),
  membership: membershipLookup(adapter)
})
