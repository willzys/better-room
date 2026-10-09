import { memoryAdapter } from 'better-auth/adapters/memory'

import { betterRoom } from '@/plugin'

import { EARLIER } from './fixtures'
import { empty } from './memory'

import type { Tables } from './memory'

export const adapterFor = (db = empty()) =>
  memoryAdapter(db)({ plugins: [betterRoom()] })

export const codeRow = (identifier: string, createdAt: Date) => ({
  id: `row-${identifier}`,
  identifier,
  roomId: 'room-1',
  status: 'active',
  expiresAt: null,
  revokedAt: null,
  createdAt
})

export const occupied = (overrides: Record<string, unknown> = {}) => ({
  id: 'member-1',
  roomId: 'room-1',
  actorId: 'actor-1',
  role: 'participant',
  joinedAt: EARLIER,
  expiresAt: null,
  leftAt: null,
  revokedAt: null,
  occupancy: 1,
  releasedAt: null,
  ...overrides
})

export const seated = (db: Tables, count: number) => {
  db.room.push({
    id: 'room-1',
    status: 'active',
    memberCount: count,
    maxMembers: null,
    expiresAt: null,
    createdBy: null,
    createdAt: EARLIER
  })
}

export const lost = new Error('connection lost after the write landed')

export const seatOf = <Seat>(seat: Seat | null): Seat => {
  if (seat === null) throw new Error('expected the membership to be there')

  return seat
}
