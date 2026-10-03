import { readAccess } from '@/core/operations/reads/access'

import type { Actor } from '@/core/actor'
import type { AccessStore } from '@/core/operations/reads/access'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

export type OccupancyRefusal = 'not-a-member' | 'unknown-room'

export type OccupancyStore = AccessStore & {
  readonly occupied: (roomId: string, now: Date) => Promise<number>
}

export type OccupancyRequest = {
  readonly roomId: string
  readonly actor: Usable<Actor>
  readonly fromServer: boolean
  readonly now: Date
}

export type Occupied = {
  readonly read: true
  readonly room: Room
  readonly occupied: number
}

export type OccupancyOutcome =
  | { readonly read: false; readonly refusal: OccupancyRefusal }
  | Occupied

export const readOccupancy = async (
  request: OccupancyRequest,
  store: OccupancyStore
): Promise<OccupancyOutcome> => {
  const access = await readAccess(request, store)

  if (!access.found) return { read: false, refusal: 'unknown-room' }

  if (!request.fromServer && !access.authorized) {
    return { read: false, refusal: 'not-a-member' }
  }

  return {
    read: true,
    room: access.room,
    occupied: await store.occupied(access.room.id, request.now)
  }
}
