import { membershipRefusal } from '@/core/membership'
import { roomRefusal } from '@/core/room'
import { isResolvable } from '@/core/room-code'

import type { Actor } from '@/core/actor'
import type { Membership, MembershipRefusal } from '@/core/membership'
import type { Room, RoomRefusal } from '@/core/room'
import type { RoomCode } from '@/core/room-code'
import type { Perpetual, Unbounded, Usable } from '@/types/absence'

const JOINED_ROLE = 'participant'

export type Enrolment = {
  readonly roomId: string
  readonly actorId: string
  readonly role: string
  readonly expiresAt: Perpetual<Date>
}

export type JoinRefusal =
  | MembershipRefusal
  | RoomRefusal
  | 'at-capacity'
  | 'unresolved'

export type Seated = {
  readonly membership: Membership
  readonly occupied: boolean
}

export type JoinStore = {
  readonly code: (identifier: string) => Promise<Usable<RoomCode>>
  readonly room: (id: string) => Promise<Usable<Room>>
  readonly membership: (
    roomId: string,
    actorId: string
  ) => Promise<Usable<Membership>>
  readonly admit: (roomId: string, limit: Unbounded<number>) => Promise<boolean>
  readonly enroll: (member: Enrolment) => Promise<Seated>
  readonly reinstate: (membershipId: string) => Promise<Seated>
  readonly lowerCount: (roomId: string) => Promise<void>
}

export type JoinRequest = {
  readonly codeIdentifier: string
  readonly actor: () => Promise<Actor>
  readonly now: Date
}

export type JoinOutcome =
  | { readonly admitted: false; readonly refusal: JoinRefusal }
  | {
      readonly admitted: true
      readonly actor: Actor
      readonly membership: Membership
    }

const refuse = (refusal: JoinRefusal): JoinOutcome => ({
  admitted: false,
  refusal
})

const admit = (actor: Actor, membership: Membership): JoinOutcome => ({
  admitted: true,
  actor,
  membership
})

const seat = async (
  room: Room,
  actor: Actor,
  existing: Usable<Membership>,
  store: JoinStore
): Promise<Membership> => {
  const seated =
    existing === null
      ? await store.enroll({
          roomId: room.id,
          actorId: actor.id,
          role: JOINED_ROLE,
          expiresAt: null
        })
      : await store.reinstate(existing.id)

  if (!seated.occupied) await store.lowerCount(room.id)

  return seated.membership
}

export const join = async (
  request: JoinRequest,
  store: JoinStore
): Promise<JoinOutcome> => {
  const code = await store.code(request.codeIdentifier)

  if (code === null || !isResolvable(code, request.now)) {
    return refuse('unresolved')
  }

  const room = await store.room(code.roomId)

  if (room === null) return refuse('unresolved')

  const refusal = roomRefusal(room, request.now)

  if (refusal !== null) return refuse(refusal)

  const actor = await request.actor()
  const existing = await store.membership(room.id, actor.id)

  if (existing !== null) {
    const held = membershipRefusal(existing, request.now)

    if (held !== null) return refuse(held)
    if (existing.leftAt === null) return admit(actor, existing)
  }

  if (!(await store.admit(room.id, room.maxMembers))) {
    return refuse('at-capacity')
  }

  return admit(actor, await seat(room, actor, existing, store))
}
