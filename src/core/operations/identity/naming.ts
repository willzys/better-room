import { isAuthorized, readAccess } from '@/core/operations/reads/access'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { AccessStore } from '@/core/operations/reads/access'
import type { Unnamed, Usable } from '@/types/absence'

export type NamingRefusal = 'not-a-member' | 'unknown-room'

export type NamingStore = AccessStore & {
  readonly rename: (
    membershipId: string,
    displayName: Unnamed<string>
  ) => Promise<Usable<Membership>>
}

export type NamingRequest = {
  readonly roomId: string
  readonly actor: Usable<Actor>
  readonly displayName: Unnamed<string>
  readonly now: Date
}

export type NamingOutcome =
  | { readonly named: false; readonly refusal: NamingRefusal }
  | {
      readonly named: true
      readonly membership: Membership
      readonly changed: boolean
    }

const refuse = (refusal: NamingRefusal): NamingOutcome => ({
  named: false,
  refusal
})

export const renameMember = async (
  request: NamingRequest,
  store: NamingStore
): Promise<NamingOutcome> => {
  const access = await readAccess(request, store)

  if (!access.found) return refuse('unknown-room')

  const { room, held } = access

  if (!isAuthorized(room, held, request.now)) return refuse('not-a-member')

  if (held.displayName === request.displayName) {
    return { named: true, membership: held, changed: false }
  }

  const renamed = await store.rename(held.id, request.displayName)

  return renamed === null
    ? refuse('not-a-member')
    : { named: true, membership: renamed, changed: true }
}
