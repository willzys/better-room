import { joinStore } from '@/plugin/stores/admission/join'
import { releaseStore } from '@/plugin/stores/capacity/release'

import type { DBAdapter } from 'better-auth/types'

import type { LeaveStore } from '@/core/operations/capacity/leave'

export const leaveStore = (adapter: DBAdapter): LeaveStore => {
  const joins = joinStore(adapter)

  return {
    ...releaseStore(adapter),
    room: joins.room,
    membership: joins.membership
  }
}
