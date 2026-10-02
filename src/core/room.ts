export type RoomStatus = 'active' | 'locked' | 'closed'

export type Room = {
  id: string
  status: RoomStatus
  memberCount: number
  maxMembers: number | null
  expiresAt: Date | null
  createdBy: string | null
  createdAt: Date
}
