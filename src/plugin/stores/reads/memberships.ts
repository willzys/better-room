import { EXPIRY_BRANCHES } from '@/core/operations/reads/memberships'
import { toMembership, toRoom } from '@/plugin/stores/rows'
import { memberTable, roomTable } from '@/plugin/stores/table'
import { beyond } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { Membership } from '@/core/membership'
import type {
  ExpiryBranch,
  HeldMemberships,
  MembershipsStore,
  Resumption
} from '@/core/operations/reads/memberships'
import type { MemberRow } from '@/plugin/stores/rows'
import type { Unstarted } from '@/types/absence'

type Members = ReturnType<typeof memberTable>

type Listing = {
  readonly actorId: string
  readonly now: Date
  readonly ceiling: number
}

type Page = {
  readonly actorId: string
  readonly now: Date
  readonly branch: ExpiryBranch
  readonly after: Unstarted<string>
  readonly limit: number
}

const read = async (members: Members, page: Page): Promise<Membership[]> => {
  const rows = await members.findMany({
    where: [
      { field: 'actorId', value: page.actorId },
      { field: 'leftAt', value: null },
      { field: 'revokedAt', value: null },
      page.branch === 'perpetual'
        ? { field: 'expiresAt', value: null }
        : { field: 'expiresAt', operator: 'gt', value: page.now },
      ...beyond<MemberRow>('id', page.after)
    ],
    sortBy: { field: 'id', direction: 'asc' },
    limit: page.limit
  })

  return rows.map(toMembership)
}

const walk = async (
  members: Members,
  listing: Listing,
  from: Resumption,
  gathered: Membership[]
): Promise<HeldMemberships> => {
  const remaining = listing.ceiling - gathered.length
  const rows = await read(members, {
    actorId: listing.actorId,
    now: listing.now,
    ...from,
    limit: remaining + 1
  })
  const kept = rows.slice(0, remaining)
  const memberships = [...gathered, ...kept]

  if (rows.length > remaining) {
    return {
      memberships,
      complete: false,
      next: { branch: from.branch, after: kept.at(-1)?.id ?? from.after }
    }
  }

  const following = EXPIRY_BRANCHES[EXPIRY_BRANCHES.indexOf(from.branch) + 1]

  if (following === undefined) {
    return { memberships, complete: true, next: null }
  }

  return walk(members, listing, { branch: following, after: null }, memberships)
}

export const membershipsStore = (adapter: DBAdapter): MembershipsStore => {
  const members = memberTable(adapter)
  const roomRows = roomTable(adapter)

  const held = (
    actorId: string,
    now: Date,
    before: Unstarted<Resumption>,
    ceiling: number
  ) =>
    walk(
      members,
      { actorId, now, ceiling },
      before ?? { branch: 'perpetual', after: null },
      []
    )

  const rooms = async (ids: string[]) => {
    const rows = await roomRows.findMany({
      where: [{ field: 'id', operator: 'in', value: ids }],
      limit: ids.length
    })

    return rows.map(toRoom)
  }

  return { held, rooms }
}
