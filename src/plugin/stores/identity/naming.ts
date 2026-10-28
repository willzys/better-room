import { accessStore } from '@/plugin/stores/reads/access'
import { found, toMembership } from '@/plugin/stores/rows'
import { memberTable } from '@/plugin/stores/table'
import { byId } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { NamingStore } from '@/core/operations/identity/naming'
import type { Unnamed } from '@/types/absence'

export const namingStore = (adapter: DBAdapter): NamingStore => {
  const members = memberTable(adapter)

  const rename = async (membershipId: string, displayName: Unnamed<string>) =>
    found(
      await members.update({
        where: [
          ...byId(membershipId),
          { field: 'leftAt', value: null },
          { field: 'revokedAt', value: null }
        ],
        set: { displayName }
      }),
      toMembership
    )

  return { ...accessStore(adapter), rename }
}
