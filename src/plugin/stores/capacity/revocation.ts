import { joinStore } from '@/plugin/stores/admission/join'
import { releaseStore } from '@/plugin/stores/capacity/release'
import { byId, found, MODELS, toMembership } from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type { RevocationStore } from '@/core/operations/capacity/revocation'
import type { MemberRow } from '@/plugin/stores/rows'

export const revocationStore = (adapter: DBAdapter): RevocationStore => {
  const joins = joinStore(adapter)

  return {
    ...releaseStore(adapter),
    room: joins.room,
    membership: joins.membership,
    revoke: async (membershipId, at) =>
      found(
        await adapter.update<MemberRow>({
          model: MODELS.member,
          where: [...byId(membershipId), { field: 'revokedAt', value: null }],
          update: { revokedAt: at }
        }),
        toMembership
      )
  }
}
