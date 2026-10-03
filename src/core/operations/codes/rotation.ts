import { issueCode } from '@/core/room-code'

import type { Room } from '@/core/room'
import type { CodeIssuer, Mint } from '@/core/room-code'
import type { Usable } from '@/types/absence'

export type RotationRefusal = 'closed' | 'exhausted' | 'unknown-room'

export type RotationStore = CodeIssuer & {
  readonly room: (id: string) => Promise<Usable<Room>>
  readonly retireGrace: (roomId: string, at: Date) => Promise<void>
  readonly activeCodes: (roomId: string) => Promise<string[]>
  readonly demoteOthers: (
    roomId: string,
    codeIds: string[],
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

  const replaced = await store.activeCodes(request.roomId)

  const minted = await issueCode(
    {
      roomId: request.roomId,
      mint: request.mint,
      now: request.now,
      replacing: replaced
    },
    store
  )

  if (minted === null) return { rotated: false, refusal: 'exhausted' }

  if (replaced.length > 0) {
    await store.demoteOthers(
      request.roomId,
      replaced,
      new Date(request.now.getTime() + request.grace * 1000)
    )
  }

  return { rotated: true, code: minted.code }
}
