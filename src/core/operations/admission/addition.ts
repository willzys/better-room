import { remains, seat } from '@/core/operations/admission/seating'
import { hasEnded } from '@/core/room'

import type { Membership } from '@/core/membership'
import type {
  ActorLink,
  SeatingStore
} from '@/core/operations/admission/seating'
import type { Room } from '@/core/room'
import type { Absent, Perpetual, Usable } from '@/types/absence'

const ADDABLE = ['active', 'locked'] as const

export type AdditionRefusal =
  | 'already-a-member'
  | 'revoked'
  | 'at-capacity'
  | 'closed'
  | 'contended'
  | 'expired'
  | 'expires-in-the-past'
  | 'unknown-actor'
  | 'unknown-room'

export type AdditionStore = SeatingStore & {
  readonly room: (id: string) => Promise<Usable<Room>>
  readonly membership: (
    roomId: string,
    actorId: string
  ) => Promise<Usable<Membership>>
}

export type AdditionRequest = {
  readonly roomId: string
  readonly actor: ActorLink
  readonly role: string
  readonly expiresAt: Perpetual<Date>
  readonly now: Date
}

export type AdditionOutcome =
  | { readonly added: false; readonly refusal: AdditionRefusal }
  | { readonly added: true; readonly membership: Membership }

const refuse = (refusal: AdditionRefusal): AdditionOutcome => ({
  added: false,
  refusal
})

const heldAlready = (membership: Membership): AdditionOutcome =>
  refuse(membership.revokedAt === null ? 'already-a-member' : 'revoked')

const admits = (room: Room, now: Date): AdditionRefusal | Absent => {
  if (!hasEnded(room, now)) return null

  return room.status === 'closed' ? 'closed' : 'expired'
}

const turnedAway = async (
  request: AdditionRequest,
  store: AdditionStore
): Promise<AdditionOutcome> => {
  const [room, membership] = await Promise.all([
    store.room(request.roomId),
    store.membership(request.roomId, request.actor.id)
  ])

  if (membership !== null) return heldAlready(membership)
  if (room === null) return refuse('unknown-room')

  return refuse(admits(room, request.now) ?? 'at-capacity')
}

export const addMember = async (
  request: AdditionRequest,
  store: AdditionStore
): Promise<AdditionOutcome> => {
  if (request.expiresAt !== null && request.expiresAt <= request.now) {
    return refuse('expires-in-the-past')
  }

  const room = await store.room(request.roomId)

  if (room === null) return refuse('unknown-room')

  const refusal = admits(room, request.now)

  if (refusal !== null) return refuse(refusal)

  const existing = await store.membership(room.id, request.actor.id)

  if (existing !== null) return heldAlready(existing)

  const admitted = await store.admit(room.id, room.maxMembers, ADDABLE)

  if (!admitted) return turnedAway(request, store)

  const terms = { role: request.role, expiresAt: request.expiresAt }
  const seated = await seat(
    { room, actor: request.actor, terms, existing },
    store
  )
  const survives = await remains(request.actor, request.now, store)

  if (!survives) return refuse('unknown-actor')
  if (seated === null) return refuse('contended')
  if (!seated.occupied) return refuse('already-a-member')

  return { added: true, membership: seated.membership }
}
