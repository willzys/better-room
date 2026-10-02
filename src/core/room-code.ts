export type RoomCodeStatus = 'active' | 'grace' | 'revoked'

export type RoomCode = {
  id: string
  roomId: string
  status: RoomCodeStatus
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}
