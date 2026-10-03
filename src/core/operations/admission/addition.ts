import { hasEnded } from '@/core/room'

import type { Membership } from '@/core/membership'
import type { Enrolment, Seated } from '@/core/operations/admission/join'
import type { Room } from '@/core/room'
import type { Absent, Perpetual, Unbounded, Usable } from '@/types/absence'

export type AdditionRefusal =
  | 'already-a-member'
  | 'at-capacity'
  | 'closed'
  | 'expired'
  | 'expires-in-the-past'
  | 'unknown-room'

export type AdditionStore = {
  readonly room: (id: string) => Promise<Usable<Room>>
  readonly membership: (
    roomId: string,
    actorId: string
  ) => Promise<Usable<Membership>>
  readonly admit: (roomId: string, limit: Unbounded<number>) => Promise<boolean>
  readonly enroll: (member: Enrolment) => Promise<Seated>
  readonly lowerCount: (roomId: string) => Promise<void>
}

export type AdditionRequest = {
  readonly roomId: string
  readonly actorId: string
  readonly role: string
  readonly expiresAt: Perpetual<Date>
  readonly now: Date
}

export type AdditionOutcome =
  | { readonly added: false; readonly refusal: AdditionRefusal }
  | { readonly added: true; readonly membership: Membership }

const admits = (room: Room, now: Date): AdditionRefusal | Absent => {
  if (!hasEnded(room, now)) return null

  return room.status === 'closed' ? 'closed' : 'expired'
}

export const addMember = async (
  request: AdditionRequest,
  store: AdditionStore
): Promise<AdditionOutcome> => {
  if (request.expiresAt !== null && request.expiresAt <= request.now) {
    return { added: false, refusal: 'expires-in-the-past' }
  }

  const room = await store.room(request.roomId)

  if (room === null) return { added: false, refusal: 'unknown-room' }

  const refusal = admits(room, request.now)

  if (refusal !== null) return { added: false, refusal }

  const existing = await store.membership(request.roomId, request.actorId)

  if (existing !== null) return { added: false, refusal: 'already-a-member' }

  if (!(await store.admit(room.id, room.maxMembers))) {
    return { added: false, refusal: 'at-capacity' }
  }

  const seated = await store.enroll({
    roomId: room.id,
    actorId: request.actorId,
    role: request.role,
    expiresAt: request.expiresAt
  })

  if (!seated.occupied) {
    await store.lowerCount(room.id)

    return { added: false, refusal: 'already-a-member' }
  }

  return { added: true, membership: seated.membership }
}
