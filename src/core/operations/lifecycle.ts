import type { Room, RoomStatus } from '@/core/room'
import type { Usable } from '@/types/absence'

export type LifecycleRefusal = 'closed' | 'unknown-room'

export type Transition = 'close' | 'lock' | 'unlock'

export type LifecycleStore = {
  readonly room: (id: string) => Promise<Usable<Room>>
  readonly settle: (roomId: string, status: RoomStatus) => Promise<Usable<Room>>
}

export type LifecycleRequest = {
  readonly roomId: string
  readonly transition: Transition
}

export type LifecycleOutcome =
  | { readonly settled: false; readonly refusal: LifecycleRefusal }
  | { readonly settled: true; readonly room: Room }

const INTENDED: Record<Transition, RoomStatus> = {
  close: 'closed',
  lock: 'locked',
  unlock: 'active'
}

export const settleRoom = async (
  request: LifecycleRequest,
  store: LifecycleStore
): Promise<LifecycleOutcome> => {
  const room = await store.room(request.roomId)

  if (room === null) return { settled: false, refusal: 'unknown-room' }

  const intended = INTENDED[request.transition]

  if (room.status === intended) return { settled: true, room }

  if (room.status === 'closed') return { settled: false, refusal: 'closed' }

  const settled = await store.settle(request.roomId, intended)

  if (settled === null) return { settled: false, refusal: 'unknown-room' }

  return { settled: true, room: settled }
}
