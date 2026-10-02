import { release } from '@/core/operations/release'

import type { Membership } from '@/core/membership'
import type { ReleaseStore } from '@/core/operations/release'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

export type RevocationRefusal =
  | 'already-revoked'
  | 'not-a-member'
  | 'unknown-room'

export type RevocationStore = ReleaseStore & {
  readonly room: (id: string) => Promise<Usable<Room>>
  readonly membership: (
    roomId: string,
    actorId: string
  ) => Promise<Usable<Membership>>
  readonly revoke: (
    membershipId: string,
    at: Date
  ) => Promise<Usable<Membership>>
}

export type RevocationRequest = {
  readonly roomId: string
  readonly actorId: string
  readonly now: Date
}

export type RevocationOutcome =
  | { readonly revoked: false; readonly refusal: RevocationRefusal }
  | { readonly revoked: true; readonly membership: Membership }

export const revokeMember = async (
  request: RevocationRequest,
  store: RevocationStore
): Promise<RevocationOutcome> => {
  const room = await store.room(request.roomId)

  if (room === null) return { revoked: false, refusal: 'unknown-room' }

  const held = await store.membership(request.roomId, request.actorId)

  if (held === null) return { revoked: false, refusal: 'not-a-member' }

  if (held.revokedAt !== null) {
    return { revoked: false, refusal: 'already-revoked' }
  }

  const withdrawn = await store.revoke(held.id, request.now)

  await release(held, request.now, store)

  return { revoked: true, membership: withdrawn ?? held }
}
