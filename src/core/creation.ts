import { issueCode } from '@/core/room-code'

import type { Room } from '@/core/room'
import type { CodeIssuer, Mint } from '@/core/room-code'
import type { Perpetual, Unbounded, Unlinked, Usable } from '@/types/absence'

export type CreationStore = CodeIssuer & {
  readonly openRoom: (room: {
    readonly createdBy: Unlinked<string>
    readonly maxMembers: Unbounded<number>
    readonly expiresAt: Perpetual<Date>
  }) => Promise<Room>
}

export type CreationRequest = {
  readonly createdBy: Unlinked<string>
  readonly maxMembers: Unbounded<number>
  readonly expiresAt: Perpetual<Date>
  readonly mint: Mint
  readonly now: Date
}

export type Created = {
  readonly room: Room
  readonly code: string
}

export const createRoom = async (
  request: CreationRequest,
  store: CreationStore
): Promise<Usable<Created>> => {
  const room = await store.openRoom({
    createdBy: request.createdBy,
    maxMembers: request.maxMembers,
    expiresAt: request.expiresAt
  })

  const minted = await issueCode(
    { roomId: room.id, mint: request.mint, now: request.now },
    store
  )

  return minted === null ? null : { room, code: minted.code }
}
