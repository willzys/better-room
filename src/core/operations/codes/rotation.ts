import { hasEnded } from '@/core/room'
import { issueCode } from '@/core/room-code'

import type { Room } from '@/core/room'
import type { CodeIssuer, Mint } from '@/core/room-code'
import type { Usable } from '@/types/absence'

const ACTIVE_CODES = { page: 100 } as const

export type RotationRefusal =
  | 'closed'
  | 'exhausted'
  | 'expired'
  | 'unknown-room'

export type RotationStore = CodeIssuer & {
  readonly room: (id: string) => Promise<Usable<Room>>
  readonly retireGrace: (roomId: string, at: Date) => Promise<void>
  readonly activeCodes: (roomId: string, page: number) => Promise<string[]>
  readonly demoteOthers: (
    roomId: string,
    codeIds: string[],
    until: Date,
    page: number
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

const refuse = (refusal: RotationRefusal): RotationOutcome => ({
  rotated: false,
  refusal
})

export const rotateCode = async (
  request: RotationRequest,
  store: RotationStore
): Promise<RotationOutcome> => {
  const room = await store.room(request.roomId)

  if (room === null) return refuse('unknown-room')
  if (hasEnded(room, request.now)) {
    return refuse(room.status === 'closed' ? 'closed' : 'expired')
  }

  await store.retireGrace(request.roomId, request.now)

  const replaced = await store.activeCodes(request.roomId, ACTIVE_CODES.page)

  const minted = await issueCode(
    {
      roomId: request.roomId,
      mint: request.mint,
      now: request.now,
      replacing: replaced
    },
    store
  )

  if (minted === null) return refuse('exhausted')

  if (replaced.length > 0) {
    await store.demoteOthers(
      request.roomId,
      replaced,
      new Date(request.now.getTime() + request.grace * 1000),
      ACTIVE_CODES.page
    )
  }

  return { rotated: true, code: minted.code }
}
