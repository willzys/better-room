import { relinquish } from '@/core/operations/capacity/release'
import {
  eraseActor,
  FORGET_ATTEMPTS,
  forgetActor
} from '@/core/operations/identity/erasure'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { ActorLink } from '@/core/operations/admission/seating'
import type { ErasureStore } from '@/core/operations/identity/erasure'
import type { Usable } from '@/types/absence'

export type PromotionRefusal =
  | 'already-linked'
  | 'stale-grant'
  | 'unknown-actor'

export type PromotionStore = ErasureStore & {
  readonly byId: (id: string) => Promise<Usable<Actor>>
  readonly owner: (userId: string) => Promise<Actor>
  readonly invalidate: (actorId: string, epoch: number) => Promise<boolean>
  readonly survives: (actor: ActorLink) => Promise<boolean>
  readonly membership: (
    roomId: string,
    actorId: string
  ) => Promise<Usable<Membership>>
  readonly reassign: (
    membershipId: string,
    roomId: string,
    actorId: string
  ) => Promise<boolean>
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

  await relinquish(membership, now, store)

  return false
}

const SWEEP = { passes: 50, page: 200 } as const

type Sweep = {
  readonly anonymousId: string
  readonly owner: Actor
  readonly now: Date
  readonly store: PromotionStore
}

type Tally = {
  readonly carried: number
  readonly discarded: number
}

const carryPage = async (held: Membership[], sweep: Sweep): Promise<Tally> => {
  const settled = await Promise.all(
    held.map(membership =>
      carry(membership, sweep.owner, sweep.now, sweep.store)
    )
  )
  const carried = settled.filter(Boolean).length

  return { carried, discarded: settled.length - carried }
}

type Moved = Tally & { readonly emptied: boolean }

const sweeping = async (
  sweep: Sweep,
  tally: Tally,
  passes: number
): Promise<Moved> => {
  const held = await sweep.store.heldBy(sweep.anonymousId, SWEEP.page)

  if (held.length === 0) return { ...tally, emptied: true }
  if (passes === 0) return { ...tally, emptied: false }

  const page = await carryPage(held, sweep)

  return sweeping(
    sweep,
    {
      carried: tally.carried + page.carried,
      discarded: tally.discarded + page.discarded
    },
    passes - 1
  )
}

const retiring = async (
  sweep: Sweep,
  tally: Tally,
  attempts: number
): Promise<Moved> => {
  const moved = await sweeping(sweep, tally, SWEEP.passes)

  if (!moved.emptied) return moved

  const orphaned = await forgetActor(sweep.anonymousId, sweep.now, sweep.store)

  if (orphaned !== null) {
    return { ...moved, discarded: moved.discarded + orphaned }
  }
  if (attempts === 0) return { ...moved, emptied: false }

  return retiring(sweep, moved, attempts - 1)
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

  const invalidated = await store.invalidate(anonymous.id, anonymous.grantEpoch)

  if (!invalidated) return refuse('stale-grant')

  const moved = await retiring(
    { anonymousId: anonymous.id, owner, now: request.now, store },
    { carried: 0, discarded: 0 },
    FORGET_ATTEMPTS
  )

  const survives = await store.survives(owner)

  if (!survives) {
    await eraseActor({ actorId: owner.id, now: request.now }, store)

    return refuse('unknown-actor')
  }

  return {
    promoted: true,
    actor: owner,
    merged: anonymous.id,
    carried: moved.carried,
    discarded: moved.discarded,
    complete: moved.emptied
  }
}
