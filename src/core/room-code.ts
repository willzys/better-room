import type { Pending, Perpetual } from '@/types/absence'

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
