import {
  HELD_CEILING,
  MODELS,
  toMembership,
  toRoom
} from '@/plugin/stores/rows'

import type { DBAdapter, Where } from 'better-auth/types'

import type { Membership } from '@/core/membership'
import type { MembershipsStore } from '@/core/operations/reads/memberships'
import type { MemberRow, RoomRow } from '@/plugin/stores/rows'

const standing = (actorId: string): Where[] => [
  { field: 'actorId', value: actorId },
  { field: 'leftAt', value: null },
  { field: 'revokedAt', value: null }
]

const byRecency = (
  left: readonly Membership[],
  right: readonly Membership[]
): Membership[] => {
  const merged: Membership[] = []
  let fromLeft = 0
  let fromRight = 0

  while (merged.length < HELD_CEILING) {
    const head = left[fromLeft]
    const rival = right[fromRight]

    if (head === undefined) {
      if (rival === undefined) break

      merged.push(rival)
      fromRight++
    } else if (
      rival === undefined ||
      head.joinedAt.getTime() >= rival.joinedAt.getTime()
    ) {
      merged.push(head)
      fromLeft++
    } else {
      merged.push(rival)
      fromRight++
    }
  }

  return merged
}

const page = (adapter: DBAdapter, where: Where[]) =>
  adapter.findMany<MemberRow>({
    model: MODELS.member,
    where,
    sortBy: { field: 'joinedAt', direction: 'desc' },
    limit: HELD_CEILING
  })

export const membershipsStore = (adapter: DBAdapter): MembershipsStore => ({
  held: async (actorId, now) => {
    const [perpetual, dated] = await Promise.all([
      page(adapter, [
        ...standing(actorId),
        { field: 'expiresAt', value: null }
      ]),
      page(adapter, [
        ...standing(actorId),
        { field: 'expiresAt', operator: 'gt', value: now }
      ])
    ])

    const memberships = byRecency(
      perpetual.map(toMembership),
      dated.map(toMembership)
    )

    return {
      memberships,
      complete:
        perpetual.length < HELD_CEILING &&
        dated.length < HELD_CEILING &&
        memberships.length === perpetual.length + dated.length
    }
  },
  rooms: async ids =>
    (
      await adapter.findMany<RoomRow>({
        model: MODELS.room,
        where: [{ field: 'id', operator: 'in', value: ids }],
        limit: ids.length
      })
    ).map(toRoom)
})
