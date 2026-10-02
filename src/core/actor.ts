import type { Unlinked, Usable } from '@/types/absence'

export type Actor = {
  id: string
  userId: Unlinked<string>
  grantEpoch: number
  createdAt: Date
}

export type ActorClaim = {
  readonly actorId: string
  readonly epoch: number
}

export type ActorCarriers = {
  readonly userId: Usable<string>
  readonly claim: Usable<ActorClaim>
}

export type ActorStore = {
  readonly byId: (id: string) => Promise<Usable<Actor>>
  readonly byUser: (userId: string) => Promise<Usable<Actor>>
  readonly create: (userId: Unlinked<string>) => Promise<Actor>
}

const claimed = (actor: Usable<Actor>, claim: ActorClaim): actor is Actor =>
  actor !== null && actor.userId === null && actor.grantEpoch === claim.epoch

export const resolveActor = async (
  carriers: ActorCarriers,
  store: ActorStore
): Promise<Actor> => {
  if (carriers.userId !== null) {
    const linked = await store.byUser(carriers.userId)

    return linked ?? store.create(carriers.userId)
  }

  if (carriers.claim !== null) {
    const actor = await store.byId(carriers.claim.actorId)

    if (claimed(actor, carriers.claim)) return actor
  }

  return store.create(null)
}
