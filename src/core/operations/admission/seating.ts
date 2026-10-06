import { eraseActor } from '@/core/operations/identity/erasure'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { ErasureStore } from '@/core/operations/identity/erasure'
import type { Room, RoomStatus } from '@/core/room'
import type { Perpetual, Unbounded, Usable } from '@/types/absence'

export type Terms = {
  readonly role: string
  readonly expiresAt: Perpetual<Date>
}

export type Enrolment = Terms & {
  readonly roomId: string
  readonly actorId: string
}

export type Seated = {
  readonly membership: Membership
  readonly occupied: boolean
}

export type ActorLink = Pick<Actor, 'id' | 'userId'>

export type Return = 'rejoin' | 'readmission'

export type SeatingStore = {
  readonly admit: (
    roomId: string,
    limit: Unbounded<number>,
    open: readonly RoomStatus[]
  ) => Promise<boolean>
  readonly enroll: (member: Enrolment) => Promise<Membership>
  readonly occupy: (
    membershipId: string,
    terms: Terms
  ) => Promise<Usable<Seated>>
  readonly reinstate: (membershipId: string) => Promise<Usable<Seated>>
  readonly readmit: (
    membershipId: string,
    terms: Terms
  ) => Promise<Usable<Seated>>
  readonly lowerCount: (roomId: string) => Promise<void>
  readonly survives: (actor: ActorLink) => Promise<boolean>
  readonly erasure: ErasureStore
}

export type Seating = {
  readonly room: Room
  readonly actor: ActorLink
  readonly terms: Terms
  readonly existing: Usable<Membership>
  readonly returning: Return
}

const vacancy = async (
  seating: Seating,
  store: SeatingStore
): Promise<Usable<Membership>> => {
  if (seating.existing !== null) return seating.existing

  try {
    return await store.enroll({
      roomId: seating.room.id,
      actorId: seating.actor.id,
      ...seating.terms
    })
  } catch (error) {
    await store.lowerCount(seating.room.id)

    const survives = await store.survives(seating.actor)

    if (survives) throw error

    return null
  }
}

const taken = (membershipId: string, seating: Seating, store: SeatingStore) => {
  if (seating.existing === null) {
    return store.occupy(membershipId, seating.terms)
  }

  return seating.returning === 'rejoin'
    ? store.reinstate(membershipId)
    : store.readmit(membershipId, seating.terms)
}

export const seat = async (
  seating: Seating,
  store: SeatingStore
): Promise<Usable<Seated>> => {
  const vacant = await vacancy(seating, store)

  if (vacant === null) return null

  const seated = await taken(vacant.id, seating, store)

  if (seated === null || !seated.occupied) {
    await store.lowerCount(seating.room.id)
  }

  return seated
}

export const remains = async (
  actor: ActorLink,
  now: Date,
  store: SeatingStore
): Promise<boolean> => {
  const survives = await store.survives(actor)

  if (!survives) await eraseActor({ actorId: actor.id, now }, store.erasure)

  return survives
}
