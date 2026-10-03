import { release } from '@/core/operations/capacity/release'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { ReleaseStore } from '@/core/operations/capacity/release'
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
  readonly reassign: (
    membershipId: string,
    roomId: string,
    actorId: string
  ) => Promise<boolean>
  readonly discard: (membershipId: string) => Promise<void>
  readonly forget: (actorId: string) => Promise<void>
}

export type PromotionAuthority =
  | { readonly kind: 'grant'; readonly epoch: number }
  | { readonly kind: 'server' }

export type PromotionRequest = {
  readonly userId: string
  readonly actorId: string
  readonly authority: PromotionAuthority
  readonly now: Date
}

export type Promoted = {
  readonly promoted: true
  readonly actor: Actor
  readonly merged: string
  readonly carried: number
  readonly discarded: number
  readonly complete: boolean
}

export type PromotionOutcome =
  | { readonly promoted: false; readonly refusal: PromotionRefusal }
  | Promoted

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

  if (
    standing === null &&
    (await store.reassign(membership.id, membership.roomId, owner.id))
  ) {
    return true
  }

  await release(membership, now, store, 'none')
  await store.discard(membership.id)

  return false
}

const MAX_PASSES = 50

type Sweeping = {
  readonly actorId: string
  readonly carried: number
  readonly discarded: number
  readonly passes: number
}

const sweep = async (
  owner: Actor,
  now: Date,
  store: PromotionStore,
  state: Sweeping
): Promise<{ carried: number; discarded: number; emptied: boolean }> => {
  const held = await store.heldBy(state.actorId)

  if (held.length === 0) {
    return { carried: state.carried, discarded: state.discarded, emptied: true }
  }

  if (state.passes === 0) {
    return {
      carried: state.carried,
      discarded: state.discarded,
      emptied: false
    }
  }

  const settled = await Promise.all(
    held.map(membership => carry(membership, owner, now, store))
  )
  const carried = settled.filter(Boolean).length

  return sweep(owner, now, store, {
    actorId: state.actorId,
    carried: state.carried + carried,
    discarded: state.discarded + (settled.length - carried),
    passes: state.passes - 1
  })
}

export const promote = async (
  request: PromotionRequest,
  store: PromotionStore
): Promise<PromotionOutcome> => {
  const anonymous = await store.byId(request.actorId)

  if (anonymous === null) return refuse('unknown-actor')
  if (anonymous.userId !== null) return refuse('already-linked')

  if (
    request.authority.kind === 'grant' &&
    anonymous.grantEpoch !== request.authority.epoch
  ) {
    return refuse('stale-grant')
  }

  const owner = await store.owner(request.userId)

  if (owner.id === anonymous.id) return refuse('already-linked')

  if (!(await store.invalidate(anonymous.id, anonymous.grantEpoch))) {
    return refuse('stale-grant')
  }

  const moved = await sweep(owner, request.now, store, {
    actorId: anonymous.id,
    carried: 0,
    discarded: 0,
    passes: MAX_PASSES
  })

  if (moved.emptied) await store.forget(anonymous.id)

  return {
    promoted: true,
    actor: owner,
    merged: anonymous.id,
    carried: moved.carried,
    discarded: moved.discarded,
    complete: moved.emptied
  }
}
