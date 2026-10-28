import { seatDeadline, unlapsed } from '@/core/actor'
import { membershipRefusal } from '@/core/membership'
import { remains, seat } from '@/core/operations/admission/seating'
import { isFull, roomRefusal } from '@/core/room'
import { isResolvable } from '@/core/room-code'

import type { Actor, ActorSource } from '@/core/actor'
import type { Membership, MembershipRefusal } from '@/core/membership'
import type { SeatingStore, Terms } from '@/core/operations/admission/seating'
import type { Room, RoomRefusal } from '@/core/room'
import type { RoomCode } from '@/core/room-code'
import type { Absent, Unbounded, Unnamed, Usable } from '@/types/absence'

const JOINABLE = ['active'] as const

const KEPT: Terms = { role: 'participant', displayName: null, expiresAt: null }

const JOIN_ATTEMPTS = 3

export type JoinRefusal =
  | MembershipRefusal
  | RoomRefusal
  | 'at-capacity'
  | 'contended'
  | 'unknown-actor'
  | 'unresolved'

export type JoinStore = SeatingStore & {
  readonly code: (identifiers: readonly string[]) => Promise<Usable<RoomCode>>
  readonly room: (id: string) => Promise<Usable<Room>>
  readonly membership: (
    roomId: string,
    actorId: string
  ) => Promise<Usable<Membership>>
}

export type JoinRequest = {
  readonly codeIdentifiers: readonly string[]
  readonly actor: ActorSource
  readonly seatLifetime: Unbounded<number>
  readonly displayName: Unnamed<string>
  readonly now: Date
}

export type JoinOutcome =
  | { readonly admitted: false; readonly refusal: JoinRefusal }
  | {
      readonly admitted: true
      readonly actor: Actor
      readonly membership: Membership
      readonly changed: boolean
    }

type Joining = {
  readonly room: Room
  readonly actor: Actor
  readonly terms: Terms
  readonly now: Date
  readonly store: JoinStore
}

const refuse = (refusal: JoinRefusal): JoinOutcome => ({
  admitted: false,
  refusal
})

const admit = (
  actor: Actor,
  membership: Membership,
  changed: boolean
): JoinOutcome => ({ admitted: true, actor, membership, changed })

const settledBy = (
  joining: Joining,
  membership: Membership
): JoinOutcome | Absent => {
  const refusal = membershipRefusal(membership, joining.now)

  if (refusal !== null) return refuse(refusal)
  if (membership.leftAt !== null) return null

  return admit(joining.actor, membership, false)
}

const turnedAway = async (joining: Joining): Promise<JoinOutcome> => {
  const [room, membership] = await Promise.all([
    joining.store.room(joining.room.id),
    joining.store.membership(joining.room.id, joining.actor.id)
  ])
  if (room === null) return refuse('unresolved')

  const refusal = roomRefusal(room, joining.now)

  if (refusal !== null) return refuse(refusal)

  const settled = membership === null ? null : settledBy(joining, membership)

  return settled ?? refuse('at-capacity')
}

const seated = async (
  joining: Joining,
  existing: Usable<Membership>
): Promise<JoinOutcome | Absent> => {
  const { room, actor, terms, now, store } = joining
  const taken = await seat(
    { room, actor, terms, existing, returning: 'rejoin' },
    store
  )
  const survives = await remains(actor, now, store)

  if (!survives) return refuse('unknown-actor')
  if (taken === null) return null
  if (!taken.occupied) return settledBy(joining, taken.membership)

  const overtaken = membershipRefusal(taken.membership, now)

  return overtaken === null
    ? admit(actor, taken.membership, true)
    : refuse(overtaken)
}

const seating = async (
  joining: Joining,
  attempts: number,
  created = false
): Promise<JoinOutcome> => {
  const { room, actor, store } = joining
  const existing = created ? null : await store.membership(room.id, actor.id)
  const settled = existing === null ? null : settledBy(joining, existing)

  if (settled !== null) return settled

  const admitted = await store.admit(room.id, room.maxMembers, JOINABLE)

  if (!admitted) return turnedAway(joining)

  const outcome = await seated(joining, existing)

  if (outcome !== null) return outcome
  if (attempts === 0) return refuse('contended')

  return seating(joining, attempts - 1)
}

const throughLock = async (
  request: JoinRequest,
  room: Room,
  store: JoinStore
): Promise<JoinOutcome> => {
  const actor = await request.actor.find()

  if (actor === null) return refuse('locked')

  const held = await store.membership(room.id, actor.id)
  const joining = { room, actor, terms: KEPT, now: request.now, store }
  const settled = held === null ? null : settledBy(joining, held)

  return settled?.admitted === true ? settled : refuse('locked')
}

const entering = async (
  request: JoinRequest,
  room: Room,
  store: JoinStore
): Promise<JoinOutcome> => {
  const { now, seatLifetime } = request
  const found = unlapsed(await request.actor.find(), seatLifetime, now)

  if (found === null && isFull(room)) return refuse('at-capacity')

  const actor = found ?? (await request.actor.create())
  const expiresAt = seatDeadline(actor, seatLifetime)
  const terms = { ...KEPT, displayName: request.displayName, expiresAt }
  const joining = { room, actor, terms, now, store }

  return seating(joining, JOIN_ATTEMPTS, found === null)
}

export const join = async (
  request: JoinRequest,
  store: JoinStore
): Promise<JoinOutcome> => {
  const code = await store.code(request.codeIdentifiers)

  if (code === null || !isResolvable(code, request.now)) {
    return refuse('unresolved')
  }

  const room = await store.room(code.roomId)

  if (room === null) return refuse('unresolved')

  const refusal = roomRefusal(room, request.now)

  if (refusal === 'locked') return throughLock(request, room, store)
  if (refusal !== null) return refuse(refusal)

  return entering(request, room, store)
}
