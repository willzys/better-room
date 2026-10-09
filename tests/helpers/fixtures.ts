import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { Room } from '@/core/room'
import type { Mint, RoomCode } from '@/core/room-code'

export const NOW = new Date('2026-10-02T12:00:00.000Z')
export const EARLIER = new Date(NOW.getTime() - 1000)
export const LATER = new Date(NOW.getTime() + 1000)

export const actor = (overrides: Partial<Actor> = {}): Actor => ({
  id: 'actor-1',
  userId: null,
  grantEpoch: 0,
  createdAt: EARLIER,
  ...overrides
})

export const room = (overrides: Partial<Room> = {}): Room => ({
  id: 'room-1',
  status: 'active',
  memberCount: 0,
  maxMembers: null,
  expiresAt: null,
  createdBy: null,
  createdAt: EARLIER,
  ...overrides
})

export const roomCode = (overrides: Partial<RoomCode> = {}): RoomCode => ({
  id: 'code-1',
  identifier: 'identifier',
  roomId: 'room-1',
  status: 'active',
  expiresAt: null,
  revokedAt: null,
  createdAt: EARLIER,
  ...overrides
})

export const membership = (
  overrides: Partial<Membership> = {}
): Membership => ({
  id: 'member-1',
  roomId: 'room-1',
  actorId: 'actor-1',
  role: 'participant',
  joinedAt: EARLIER,
  expiresAt: null,
  leftAt: null,
  revokedAt: null,
  ...overrides
})

export const minter = (): Mint => {
  let serial = 0

  return () => {
    serial++
    return Promise.resolve({
      code: `CODE${serial}`,
      identifier: `identifier-${serial}`
    })
  }
}
