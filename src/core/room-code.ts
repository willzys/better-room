import type { Pending, Perpetual, Usable } from '@/types/absence'

export type RoomCodeStatus = 'active' | 'grace' | 'revoked'

export type RoomCode = {
  id: string
  roomId: string
  status: RoomCodeStatus
  expiresAt: Perpetual<Date>
  revokedAt: Pending<Date>
  createdAt: Date
}

const ADMITTING = new Set<RoomCodeStatus>(['active', 'grace'])

export const isResolvable = (code: RoomCode, now: Date) =>
  ADMITTING.has(code.status) &&
  code.revokedAt === null &&
  (code.expiresAt === null || code.expiresAt > now)

const MINT_ATTEMPTS = 5

export type Minted = {
  readonly code: string
  readonly identifier: string
}

export type Mint = () => Promise<Usable<Minted>>

export type CodeIssuer = {
  readonly issueCode: (
    identifier: string,
    roomId: string,
    at: Date,
    replacing: readonly string[]
  ) => Promise<boolean>
}

const tryIssue = async (
  request: {
    roomId: string
    mint: Mint
    now: Date
    replacing: readonly string[]
  },
  store: CodeIssuer,
  attempts: number
): Promise<Usable<Minted>> => {
  if (attempts === 0) return null

  const minted = await request.mint()

  if (minted === null) return null

  if (
    await store.issueCode(
      minted.identifier,
      request.roomId,
      request.now,
      request.replacing
    )
  ) {
    return minted
  }

  return tryIssue(request, store, attempts - 1)
}

export const issueCode = (
  request: {
    roomId: string
    mint: Mint
    now: Date
    replacing: readonly string[]
  },
  store: CodeIssuer
) => tryIssue(request, store, MINT_ATTEMPTS)
