import { remains, seat } from '@/core/operations/admission/seating'
import { hasEnded } from '@/core/room'

import type { Membership } from '@/core/membership'
import type {
  ActorLink,
  Seated,
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

const standing = (membership: Membership): AdditionOutcome | Absent => {
  if (membership.revokedAt !== null) return refuse('revoked')
  if (membership.leftAt === null) return refuse('already-a-member')

  return null
}

const blockedBy = (membership: Usable<Membership>) =>
  membership === null ? null : standing(membership)

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

  const blocked = blockedBy(membership)

  if (blocked !== null) return blocked
  if (room === null) return refuse('unknown-room')

  return refuse(admits(room, request.now) ?? 'at-capacity')
}

const settled = (seated: Usable<Seated>): AdditionOutcome => {
  if (seated === null) return refuse('contended')
  if (!seated.occupied) {
    return standing(seated.membership) ?? refuse('contended')
  }

  return { added: true, membership: seated.membership }
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
  const blocked = blockedBy(existing)

  if (blocked !== null) return blocked

  const admitted = await store.admit(room.id, room.maxMembers, ADDABLE)

  if (!admitted) return turnedAway(request, store)

  const terms = { role: request.role, expiresAt: request.expiresAt }
  const seated = await seat(
    { room, actor: request.actor, terms, existing, returning: 'readmission' },
    store
  )
  const survives = await remains(request.actor, request.now, store)

  return survives ? settled(seated) : refuse('unknown-actor')
}
