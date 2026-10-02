import type { Absent, Perpetual, Unbounded, Unlinked } from '@/types/absence'

export type RoomStatus = 'active' | 'locked' | 'closed'

export type Room = {
  id: string
  status: RoomStatus
  memberCount: number
  maxMembers: Unbounded<number>
  expiresAt: Perpetual<Date>
  createdBy: Unlinked<string>
  createdAt: Date
}

export type RoomRefusal = 'closed' | 'expired' | 'locked'

export const roomRefusal = (room: Room, now: Date): RoomRefusal | Absent => {
  if (room.status === 'closed') return 'closed'
  if (room.expiresAt !== null && room.expiresAt <= now) return 'expired'
  if (room.status === 'locked') return 'locked'

  return null
}
