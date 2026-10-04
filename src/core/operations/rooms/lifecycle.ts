import type { Room, RoomStatus } from '@/core/room'
import type { Usable } from '@/types/absence'

export type LifecycleRefusal = 'closed' | 'contended' | 'unknown-room'

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

const SETTLE_ATTEMPTS = 3

const settleFrom = async (
  room: Usable<Room>,
  request: LifecycleRequest,
  store: LifecycleStore,
  attempts: number
): Promise<LifecycleOutcome> => {
  if (room === null) return { settled: false, refusal: 'unknown-room' }

  const intended = INTENDED[request.transition]

  if (room.status === intended) return { settled: true, room }
  if (room.status === 'closed') return { settled: false, refusal: 'closed' }
  if (attempts === 0) return { settled: false, refusal: 'contended' }

  const settled = await store.settle(request.roomId, intended)

  if (settled !== null) return { settled: true, room: settled }

  return settleFrom(
    await store.room(request.roomId),
    request,
    store,
    attempts - 1
  )
}

export const settleRoom = async (
  request: LifecycleRequest,
  store: LifecycleStore
): Promise<LifecycleOutcome> =>
  settleFrom(await store.room(request.roomId), request, store, SETTLE_ATTEMPTS)
