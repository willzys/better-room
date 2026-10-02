export type Membership = {
  id: string
  roomId: string
  actorId: string
  role: string
  joinedAt: Date
  expiresAt: Date | null
  leftAt: Date | null
  revokedAt: Date | null
}
