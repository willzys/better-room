import { membershipRefusal } from '@/core/membership'
import { release } from '@/core/operations/release'

import type { Actor } from '@/core/actor'
import type { Membership, MembershipRefusal } from '@/core/membership'
import type { ReleaseStore } from '@/core/operations/release'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

export type LeaveRefusal = MembershipRefusal | 'not-a-member' | 'unknown-room'

export type LeaveStore = ReleaseStore & {
  readonly room: (id: string) => Promise<Usable<Room>>
  readonly membership: (
    roomId: string,
    actorId: string
  ) => Promise<Usable<Membership>>
}

export type LeaveRequest = {
  readonly roomId: string
  readonly actor: Usable<Actor>
  readonly now: Date
}

export type LeaveOutcome =
  | { readonly left: false; readonly refusal: LeaveRefusal }
  | { readonly left: true; readonly membership: Membership }

const refuse = (refusal: LeaveRefusal): LeaveOutcome => ({
  left: false,
  refusal
})

export const leave = async (
  request: LeaveRequest,
  store: LeaveStore
): Promise<LeaveOutcome> => {
  const room = await store.room(request.roomId)

  if (room === null) return refuse('unknown-room')
  if (request.actor === null) return refuse('not-a-member')

  const held = await store.membership(request.roomId, request.actor.id)

  if (held === null) return refuse('not-a-member')

  const refusal = membershipRefusal(held, request.now)

  if (refusal !== null) return refuse(refusal)

  const withdrawn = await release(held, request.now, store, 'left')

  return {
    left: true,
    membership: withdrawn ? { ...held, leftAt: request.now } : held
  }
}
