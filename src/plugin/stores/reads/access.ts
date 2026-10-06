import { membershipLookup, roomLookup } from '@/plugin/stores/lookups'

import type { DBAdapter } from 'better-auth/types'

import type { AccessStore } from '@/core/operations/reads/access'

export const accessStore = (adapter: DBAdapter): AccessStore => ({
  room: roomLookup(adapter),
  membership: membershipLookup(adapter)
})
