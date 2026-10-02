import type { Room } from '@/core/room'
import type { Perpetual, Unbounded, Unlinked, Usable } from '@/types/absence'

const MINT_ATTEMPTS = 5

export type Minted = {
  readonly code: string
  readonly identifier: string
}

export type CreationStore = {
  readonly openRoom: (room: {
    readonly createdBy: Unlinked<string>
    readonly maxMembers: Unbounded<number>
    readonly expiresAt: Perpetual<Date>
  }) => Promise<Room>
  readonly issueCode: (
    identifier: string,
    roomId: string,
    at: Date
  ) => Promise<boolean>
}

export type CreationRequest = {
  readonly createdBy: Unlinked<string>
  readonly maxMembers: Unbounded<number>
  readonly expiresAt: Perpetual<Date>
  readonly mint: () => Promise<Usable<Minted>>
  readonly now: Date
}

export type Created = {
  readonly room: Room
  readonly code: string
}

const issue = async (
  request: CreationRequest,
  store: CreationStore,
  roomId: string,
  attempts: number
): Promise<Usable<string>> => {
  if (attempts === 0) return null

  const minted = await request.mint()

  if (minted === null) return null

  if (await store.issueCode(minted.identifier, roomId, request.now)) {
    return minted.code
  }

  return issue(request, store, roomId, attempts - 1)
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

  const code = await issue(request, store, room.id, MINT_ATTEMPTS)

  return code === null ? null : { room, code }
}
