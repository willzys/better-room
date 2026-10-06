import { writeOrConfirm } from '@/plugin/stores/collision'
import { found, toActor } from '@/plugin/stores/rows'
import { actorTable } from '@/plugin/stores/table'
import { byId } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { ActorStore } from '@/core/actor'
import type { Unlinked } from '@/types/absence'

export const actorStore = (adapter: DBAdapter): ActorStore => {
  const actors = actorTable(adapter)

  const byActorId = async (id: string) =>
    found(await actors.findOne(byId(id)), toActor)

  const byUser = async (userId: string) =>
    found(await actors.findOne([{ field: 'userId', value: userId }]), toActor)

  const create = (userId: Unlinked<string>) =>
    writeOrConfirm(
      async () => toActor(await actors.create({ userId })),
      async () => (userId === null ? null : byUser(userId))
    )

  return { byId: byActorId, byUser, create }
}
