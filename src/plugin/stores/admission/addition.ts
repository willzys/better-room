import { joinStore } from '@/plugin/stores/admission/join'

import type { DBAdapter } from 'better-auth/types'

import type { AdditionStore } from '@/core/operations/admission/addition'

export const additionStore = (adapter: DBAdapter): AdditionStore => {
  const joins = joinStore(adapter)

  return {
    room: joins.room,
    membership: joins.membership,
    admit: joins.admit,
    enroll: joins.enroll,
    lowerCount: joins.lowerCount
  }
}
