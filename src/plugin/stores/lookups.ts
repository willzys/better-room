import { found, toMembership, toRoom } from '@/plugin/stores/rows'
import {
  actorTable,
  memberTable,
  roomTable,
  userTable
} from '@/plugin/stores/table'
import { byId, pairing } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { Membership } from '@/core/membership'
import type { ActorLink } from '@/core/operations/admission/seating'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

export const roomLookup = (adapter: DBAdapter) => {
  const rooms = roomTable(adapter)

  return async (id: string): Promise<Usable<Room>> =>
    found(await rooms.findOne(byId(id)), toRoom)
}

export const membershipLookup = (adapter: DBAdapter) => {
  const members = memberTable(adapter)

  return async (roomId: string, actorId: string): Promise<Usable<Membership>> =>
    found(await members.findOne(pairing(roomId, actorId)), toMembership)
}

export const survivalLookup = (adapter: DBAdapter) => {
  const actors = actorTable(adapter)
  const users = userTable(adapter)

  return async (actor: ActorLink): Promise<boolean> => {
    const row = await actors.findOne(byId(actor.id))

    if (row === null || (row.userId ?? null) !== actor.userId) return false
    if (actor.userId === null) return true

    return (await users.findOne(byId(actor.userId))) !== null
  }
}
