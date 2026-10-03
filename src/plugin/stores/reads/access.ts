import { joinStore } from '@/plugin/stores/admission/join'

import type { DBAdapter } from 'better-auth/types'

import type { AccessStore } from '@/core/operations/reads/access'

export const accessStore = (adapter: DBAdapter): AccessStore => {
  const joins = joinStore(adapter)

  return { room: joins.room, membership: joins.membership }
}
