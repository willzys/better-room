import { EXPIRY_BRANCHES } from '@/core/operations/reads/memberships'
import { toMembership } from '@/plugin/stores/rows'
import { memberTable } from '@/plugin/stores/table'
import { beyond } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { Membership } from '@/core/membership'
import type {
  HeldMemberships,
  Resumption
} from '@/core/operations/reads/memberships'
import type { MemberRow } from '@/plugin/stores/rows'
import type { Clause } from '@/plugin/stores/where'
import type { Unstarted } from '@/types/absence'

type Members = ReturnType<typeof memberTable>

type Key = 'actorId' | 'roomId'

export type Standing = {
  readonly owner: Clause<MemberRow>
  readonly key: Key
  readonly now: Date
  readonly ceiling: number
}

const read = async (
  members: Members,
  standing: Standing,
  from: Resumption,
  limit: number
): Promise<Membership[]> => {
  const rows = await members.findMany({
    where: [
      standing.owner,
      { field: 'leftAt', value: null },
      { field: 'revokedAt', value: null },
      from.branch === 'perpetual'
        ? { field: 'expiresAt', value: null }
        : { field: 'expiresAt', operator: 'gt', value: standing.now },
      ...beyond<MemberRow>(standing.key, from.after)
    ],
    sortBy: { field: standing.key, direction: 'asc' },
    limit
  })

  return rows.map(toMembership)
}

const walk = async (
  members: Members,
  standing: Standing,
  from: Resumption,
  gathered: Membership[]
): Promise<HeldMemberships> => {
  const remaining = standing.ceiling - gathered.length
  const rows = await read(members, standing, from, remaining + 1)
  const kept = rows.slice(0, remaining)
  const memberships = [...gathered, ...kept]

  if (rows.length > remaining) {
    const last = kept.at(-1)

    return {
      memberships,
      complete: false,
      next: {
        branch: from.branch,
        after: last === undefined ? from.after : last[standing.key]
      }
    }
  }

  const following = EXPIRY_BRANCHES[EXPIRY_BRANCHES.indexOf(from.branch) + 1]

  if (following === undefined) {
    return { memberships, complete: true, next: null }
  }

  return walk(
    members,
    standing,
    { branch: following, after: null },
    memberships
  )
}

export const standingPage = (
  adapter: DBAdapter,
  standing: Standing,
  before: Unstarted<Resumption>
) =>
  walk(
    memberTable(adapter),
    standing,
    before ?? { branch: 'perpetual', after: null },
    []
  )
