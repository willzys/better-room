import { releaseStore } from '@/plugin/stores/capacity/release'
import { membershipLookup, roomLookup } from '@/plugin/stores/lookups'

import type { DBAdapter } from 'better-auth/types'

import type { LeaveStore } from '@/core/operations/capacity/leave'

export const leaveStore = (adapter: DBAdapter): LeaveStore => ({
  ...releaseStore(adapter),
  room: roomLookup(adapter),
  membership: membershipLookup(adapter)
})
