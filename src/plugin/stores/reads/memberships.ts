import { EXPIRY_BRANCHES } from '@/core/operations/reads/memberships'
import {
  HELD_CEILING,
  MODELS,
  toMembership,
  toRoom
} from '@/plugin/stores/rows'

import type { DBAdapter, Where } from 'better-auth/types'

import type { Membership } from '@/core/membership'
import type {
  ExpiryBranch,
  HeldMemberships,
  MembershipsStore,
  Resumption
} from '@/core/operations/reads/memberships'
import type { MemberRow, RoomRow } from '@/plugin/stores/rows'
import type { Unstarted } from '@/types/absence'

const read = async (
  adapter: DBAdapter,
  request: {
    readonly actorId: string
    readonly now: Date
    readonly branch: ExpiryBranch
    readonly after: Unstarted<string>
    readonly limit: number
  }
): Promise<Membership[]> =>
  (
    await adapter.findMany<MemberRow>({
      model: MODELS.member,
      where: [
        { field: 'actorId', value: request.actorId },
        { field: 'leftAt', value: null },
        { field: 'revokedAt', value: null },
        request.branch === 'perpetual'
          ? { field: 'expiresAt', value: null }
          : { field: 'expiresAt', operator: 'gt', value: request.now },
        ...(request.after === null
          ? []
          : [{ field: 'id', operator: 'gt' as const, value: request.after }])
      ] satisfies Where[],
      sortBy: { field: 'id', direction: 'asc' },
      limit: request.limit
    })
  ).map(toMembership)

const walk = async (
  adapter: DBAdapter,
  request: { readonly actorId: string; readonly now: Date },
  from: Resumption,
  gathered: Membership[]
): Promise<HeldMemberships> => {
  const remaining = HELD_CEILING - gathered.length
  const rows = await read(adapter, {
    ...request,
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

  return walk(adapter, request, { branch: following, after: null }, memberships)
}

export const membershipsStore = (adapter: DBAdapter): MembershipsStore => ({
  held: (actorId, now, before) =>
    walk(
      adapter,
      { actorId, now },
      before ?? { branch: 'perpetual', after: null },
      []
    ),
  rooms: async ids =>
    (
      await adapter.findMany<RoomRow>({
        model: MODELS.room,
        where: [{ field: 'id', operator: 'in', value: ids }],
        limit: ids.length
      })
    ).map(toRoom)
})
