import { releaseStore } from '@/plugin/stores/capacity/release'
import { membershipLookup, roomLookup } from '@/plugin/stores/lookups'
import { found, toMembership } from '@/plugin/stores/rows'
import { memberTable } from '@/plugin/stores/table'
import { byId } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { RevocationStore } from '@/core/operations/capacity/revocation'

export const revocationStore = (adapter: DBAdapter): RevocationStore => {
  const members = memberTable(adapter)

  const revoke = async (membershipId: string, at: Date) => {
    const revoked = await members.update({
      where: [...byId(membershipId), { field: 'revokedAt', value: null }],
      set: { revokedAt: at }
    })

    return found(revoked, toMembership)
  }

  return {
    ...releaseStore(adapter),
    room: roomLookup(adapter),
    membership: membershipLookup(adapter),
    revoke
  }
}
