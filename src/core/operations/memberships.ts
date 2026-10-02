import { isAuthorized } from '@/core/operations/access'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

export type MembershipsStore = {
  readonly held: (actorId: string) => Promise<Membership[]>
  readonly rooms: (ids: string[]) => Promise<Room[]>
}

export type MembershipsRequest = {
  readonly actor: Usable<Actor>
  readonly now: Date
}

export type Held = {
  readonly membership: Membership
  readonly room: Room
}

export const readMemberships = async (
  request: MembershipsRequest,
  store: MembershipsStore
): Promise<Held[]> => {
  if (request.actor === null) return []

  const held = await store.held(request.actor.id)

  if (held.length === 0) return []

  const rooms = await store.rooms(held.map(membership => membership.roomId))
  const byId = new Map(rooms.map(room => [room.id, room]))

  return held.flatMap(membership => {
    const room = byId.get(membership.roomId)

    if (room === undefined || !isAuthorized(room, membership, request.now)) {
      return []
    }

    return [{ membership, room }]
  })
}
