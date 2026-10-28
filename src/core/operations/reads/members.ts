import { readAccess } from '@/core/operations/reads/access'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { AccessStore } from '@/core/operations/reads/access'
import type {
  HeldMemberships,
  Resumption
} from '@/core/operations/reads/memberships'
import type { Exhausted, Unnamed, Unstarted, Usable } from '@/types/absence'

const ROSTER = { page: 100 } as const

export type MembersRefusal = 'not-a-member' | 'unknown-room'

export type Person = {
  readonly actorId: string
  readonly anonymous: boolean
  readonly accountName: Unnamed<string>
}

export type MembersStore = AccessStore & {
  readonly standing: (
    roomId: string,
    now: Date,
    before: Unstarted<Resumption>,
    page: number
  ) => Promise<HeldMemberships>
  readonly people: (actorIds: string[]) => Promise<Person[]>
}

export type MembersRequest = {
  readonly roomId: string
  readonly actor: Usable<Actor>
  readonly fromServer: boolean
  readonly before: Unstarted<Resumption>
  readonly now: Date
}

export type Member = {
  readonly membership: Membership
  readonly name: Unnamed<string>
  readonly anonymous: boolean
}

export type MembersOutcome =
  | { readonly read: false; readonly refusal: MembersRefusal }
  | {
      readonly read: true
      readonly members: Member[]
      readonly complete: boolean
      readonly next: Exhausted<Resumption>
    }

const refuse = (refusal: MembersRefusal): MembersOutcome => ({
  read: false,
  refusal
})

export const readMembers = async (
  request: MembersRequest,
  store: MembersStore
): Promise<MembersOutcome> => {
  const access = await readAccess(request, store)

  if (!access.found) return refuse('unknown-room')
  if (!request.fromServer && !access.authorized) return refuse('not-a-member')

  const page = await store.standing(
    access.room.id,
    request.now,
    request.before,
    ROSTER.page
  )
  const people = await store.people(
    page.memberships.map(membership => membership.actorId)
  )
  const byActor = new Map(people.map(person => [person.actorId, person]))

  return {
    read: true,
    members: page.memberships.map(membership => {
      const person = byActor.get(membership.actorId)

      return {
        membership,
        name: membership.displayName ?? person?.accountName ?? null,
        anonymous: person?.anonymous ?? true
      }
    }),
    complete: page.complete,
    next: page.next
  }
}
