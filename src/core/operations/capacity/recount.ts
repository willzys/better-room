import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

const RECOUNT_ATTEMPTS = 3

export type RecountRefusal = 'contended' | 'not-locked' | 'unknown-room'

export type RecountStore = {
  readonly room: (id: string) => Promise<Usable<Room>>
  readonly held: (roomId: string) => Promise<number>
  readonly settle: (
    roomId: string,
    from: number,
    to: number
  ) => Promise<boolean>
}

export type RecountRequest = {
  readonly roomId: string
}

export type RecountOutcome =
  | { readonly recounted: false; readonly refusal: RecountRefusal }
  | {
      readonly recounted: true
      readonly before: number
      readonly after: number
    }

const refuse = (refusal: RecountRefusal): RecountOutcome => ({
  recounted: false,
  refusal
})

const recounting = async (
  request: RecountRequest,
  store: RecountStore,
  attempts: number
): Promise<RecountOutcome> => {
  const room = await store.room(request.roomId)

  if (room === null) return refuse('unknown-room')
  if (room.status !== 'locked') return refuse('not-locked')

  const held = await store.held(room.id)

  if (held === room.memberCount) {
    return { recounted: true, before: held, after: held }
  }

  const settled = await store.settle(room.id, room.memberCount, held)

  if (settled) return { recounted: true, before: room.memberCount, after: held }
  if (attempts === 0) return refuse('contended')

  return recounting(request, store, attempts - 1)
}

export const recountCapacity = (request: RecountRequest, store: RecountStore) =>
  recounting(request, store, RECOUNT_ATTEMPTS)
