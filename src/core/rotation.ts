import { issueCode } from '@/core/room-code'

import type { Room } from '@/core/room'
import type { CodeIssuer, Mint } from '@/core/room-code'
import type { Usable } from '@/types/absence'

export type RotationRefusal = 'closed' | 'exhausted' | 'unknown-room'

export type RotationStore = CodeIssuer & {
  readonly room: (id: string) => Promise<Usable<Room>>
  readonly retireGrace: (roomId: string, at: Date) => Promise<void>
  readonly demoteOthers: (
    roomId: string,
    keep: string,
    until: Date
  ) => Promise<void>
}

export type RotationRequest = {
  readonly roomId: string
  readonly mint: Mint
  readonly grace: number
  readonly now: Date
}

export type RotationOutcome =
  | { readonly rotated: false; readonly refusal: RotationRefusal }
  | { readonly rotated: true; readonly code: string }

export const rotateCode = async (
  request: RotationRequest,
  store: RotationStore
): Promise<RotationOutcome> => {
  const room = await store.room(request.roomId)

  if (room === null) return { rotated: false, refusal: 'unknown-room' }
  if (room.status === 'closed') return { rotated: false, refusal: 'closed' }

  await store.retireGrace(request.roomId, request.now)

  const minted = await issueCode(
    { roomId: request.roomId, mint: request.mint, now: request.now },
    store
  )

  if (minted === null) return { rotated: false, refusal: 'exhausted' }

  await store.demoteOthers(
    request.roomId,
    minted.identifier,
    new Date(request.now.getTime() + request.grace * 1000)
  )

  return { rotated: true, code: minted.code }
}
