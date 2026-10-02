import { membershipRefusal } from '@/core/membership'
import { hasEnded } from '@/core/room'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

export type AccessStore = {
  readonly room: (id: string) => Promise<Usable<Room>>
  readonly membership: (
    roomId: string,
    actorId: string
  ) => Promise<Usable<Membership>>
}

export type AccessRequest = {
  readonly roomId: string
  readonly actor: Usable<Actor>
  readonly now: Date
}

export type Access =
  | { readonly found: false }
  | {
      readonly found: true
      readonly room: Room
      readonly held: Usable<Membership>
      readonly authorized: boolean
    }

const authorizes = (
  room: Room,
  held: Usable<Membership>,
  now: Date
): held is Membership =>
  held !== null &&
  held.leftAt === null &&
  membershipRefusal(held, now) === null &&
  !hasEnded(room, now)

export const readAccess = async (
  request: AccessRequest,
  store: AccessStore
): Promise<Access> => {
  const [room, held] = await Promise.all([
    store.room(request.roomId),
    request.actor === null
      ? Promise.resolve(null)
      : store.membership(request.roomId, request.actor.id)
  ])

  if (room === null) return { found: false }

  return {
    found: true,
    room,
    held,
    authorized: authorizes(room, held, request.now)
  }
}
