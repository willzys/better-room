import type { Perpetual, Unbounded, Unlinked, Usable } from '@/types/absence'

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

export type ActorSource = {
  readonly find: () => Promise<Usable<Actor>>
  readonly create: () => Promise<Actor>
}

export type ActorStore = {
  readonly byId: (id: string) => Promise<Usable<Actor>>
  readonly byUser: (userId: string) => Promise<Usable<Actor>>
  readonly create: (userId: Unlinked<string>) => Promise<Actor>
}

const claimed = (actor: Usable<Actor>, claim: ActorClaim): actor is Actor =>
  actor !== null && actor.userId === null && actor.grantEpoch === claim.epoch

export const findActor = async (
  carriers: ActorCarriers,
  store: ActorStore
): Promise<Usable<Actor>> => {
  if (carriers.userId !== null) return store.byUser(carriers.userId)

  if (carriers.claim !== null) {
    const actor = await store.byId(carriers.claim.actorId)

    if (claimed(actor, carriers.claim)) return actor
  }

  return null
}

export const resolveActor = async (
  carriers: ActorCarriers,
  store: ActorStore
): Promise<Actor> =>
  (await findActor(carriers, store)) ?? store.create(carriers.userId)

export const seatDeadline = (
  actor: Actor,
  lifetime: Unbounded<number>
): Perpetual<Date> =>
  actor.userId === null && lifetime !== null
    ? new Date(actor.createdAt.getTime() + lifetime * 1000)
    : null

export const unlapsed = (
  actor: Usable<Actor>,
  lifetime: Unbounded<number>,
  now: Date
): Usable<Actor> => {
  const deadline = actor === null ? null : seatDeadline(actor, lifetime)

  return deadline !== null && deadline <= now ? null : actor
}
