import { isAuthorized } from '@/core/operations/reads/access'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { Room } from '@/core/room'
import type { Exhausted, Unstarted, Usable } from '@/types/absence'

export const EXPIRY_BRANCHES = ['perpetual', 'dated'] as const

export type ExpiryBranch = (typeof EXPIRY_BRANCHES)[number]

export type Resumption = {
  readonly branch: ExpiryBranch
  readonly after: Unstarted<string>
}

export type HeldMemberships = {
  readonly memberships: Membership[]
  readonly complete: boolean
  readonly next: Exhausted<Resumption>
}

export type MembershipsStore = {
  readonly held: (
    actorId: string,
    now: Date,
    before: Unstarted<Resumption>
  ) => Promise<HeldMemberships>
  readonly rooms: (ids: string[]) => Promise<Room[]>
}

export type MembershipsRequest = {
  readonly actor: Usable<Actor>
  readonly now: Date
  readonly before: Unstarted<Resumption>
}

export type Held = {
  readonly membership: Membership
  readonly room: Room
}

export type Memberships = {
  readonly held: Held[]
  readonly complete: boolean
  readonly next: Exhausted<Resumption>
}

export const readMemberships = async (
  request: MembershipsRequest,
  store: MembershipsStore
): Promise<Memberships> => {
  if (request.actor === null) return { held: [], complete: true, next: null }

  const standing = await store.held(
    request.actor.id,
    request.now,
    request.before
  )

  if (standing.memberships.length === 0) {
    return { held: [], complete: standing.complete, next: standing.next }
  }

  const rooms = await store.rooms(
    standing.memberships.map(membership => membership.roomId)
  )
  const byId = new Map(rooms.map(room => [room.id, room]))

  return {
    held: standing.memberships.flatMap(membership => {
      const room = byId.get(membership.roomId)

      if (room === undefined || !isAuthorized(room, membership, request.now)) {
        return []
      }

      return [{ membership, room }]
    }),
    complete: standing.complete,
    next: standing.next
  }
}
