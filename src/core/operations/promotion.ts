import { release } from '@/core/operations/release'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { ReleaseStore } from '@/core/operations/release'
import type { Usable } from '@/types/absence'

export type PromotionRefusal =
  | 'already-linked'
  | 'stale-grant'
  | 'unknown-actor'

export type PromotionStore = ReleaseStore & {
  readonly byId: (id: string) => Promise<Usable<Actor>>
  readonly owner: (userId: string) => Promise<Actor>
  readonly invalidate: (actorId: string, epoch: number) => Promise<boolean>
  readonly heldBy: (actorId: string) => Promise<Membership[]>
  readonly membership: (
    roomId: string,
    actorId: string
  ) => Promise<Usable<Membership>>
  readonly reassign: (membershipId: string, actorId: string) => Promise<boolean>
  readonly discard: (membershipId: string) => Promise<void>
  readonly forget: (actorId: string) => Promise<void>
}

export type PromotionRequest = {
  readonly userId: string
  readonly claim: { readonly actorId: string; readonly epoch: number }
  readonly now: Date
}

export type PromotionOutcome =
  | { readonly promoted: false; readonly refusal: PromotionRefusal }
  | {
      readonly promoted: true
      readonly actor: Actor
      readonly carried: number
      readonly discarded: number
    }

const refuse = (refusal: PromotionRefusal): PromotionOutcome => ({
  promoted: false,
  refusal
})

const carry = async (
  membership: Membership,
  owner: Actor,
  now: Date,
  store: PromotionStore
): Promise<boolean> => {
  const standing = await store.membership(membership.roomId, owner.id)

  if (standing === null && (await store.reassign(membership.id, owner.id))) {
    return true
  }

  await release(membership, now, store)
  await store.discard(membership.id)

  return false
}

export const promote = async (
  request: PromotionRequest,
  store: PromotionStore
): Promise<PromotionOutcome> => {
  const anonymous = await store.byId(request.claim.actorId)

  if (anonymous === null) return refuse('unknown-actor')
  if (anonymous.userId !== null) return refuse('already-linked')
  if (anonymous.grantEpoch !== request.claim.epoch) return refuse('stale-grant')

  const owner = await store.owner(request.userId)

  if (owner.id === anonymous.id) return refuse('already-linked')

  if (!(await store.invalidate(anonymous.id, anonymous.grantEpoch))) {
    return refuse('stale-grant')
  }

  const held = await store.heldBy(anonymous.id)
  const settled = await Promise.all(
    held.map(membership => carry(membership, owner, request.now, store))
  )

  await store.forget(anonymous.id)

  const carried = settled.filter(Boolean).length

  return {
    promoted: true,
    actor: owner,
    carried,
    discarded: settled.length - carried
  }
}
