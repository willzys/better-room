import { issueCode } from '@/core/room-code'

import type { Room } from '@/core/room'
import type { CodeIssuer, Mint, Minted } from '@/core/room-code'
import type { Perpetual, Unbounded, Unlinked, Usable } from '@/types/absence'

export type CreationRefusal = 'exhausted' | 'expires-in-the-past'

export type CreationStore = CodeIssuer & {
  readonly openRoom: (room: {
    readonly createdBy: Unlinked<string>
    readonly maxMembers: Unbounded<number>
    readonly expiresAt: Perpetual<Date>
  }) => Promise<Room>
  readonly discardRoom: (roomId: string) => Promise<void>
}

export type CreationRequest = {
  readonly createdBy: Unlinked<string>
  readonly maxMembers: Unbounded<number>
  readonly expiresAt: Perpetual<Date>
  readonly mint: Mint
  readonly now: Date
}

export type CreationOutcome =
  | { readonly created: false; readonly refusal: CreationRefusal }
  | { readonly created: true; readonly room: Room; readonly code: string }

const refuse = (refusal: CreationRefusal): CreationOutcome => ({
  created: false,
  refusal
})

const coded = async (
  room: Room,
  request: CreationRequest,
  store: CreationStore
): Promise<Usable<Minted>> => {
  try {
    return await issueCode(
      { roomId: room.id, mint: request.mint, now: request.now, replacing: [] },
      store
    )
  } catch (error) {
    await store.discardRoom(room.id)
    throw error
  }
}

export const createRoom = async (
  request: CreationRequest,
  store: CreationStore
): Promise<CreationOutcome> => {
  if (request.expiresAt !== null && request.expiresAt <= request.now) {
    return refuse('expires-in-the-past')
  }

  const room = await store.openRoom({
    createdBy: request.createdBy,
    maxMembers: request.maxMembers,
    expiresAt: request.expiresAt
  })
  const minted = await coded(room, request, store)

  if (minted === null) {
    await store.discardRoom(room.id)

    return refuse('exhausted')
  }

  return { created: true, room, code: minted.code }
}
