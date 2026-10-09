import { describe, expect, test } from 'bun:test'

import { codeOf, jarOf, joinedMember, onlyRow } from '../../helpers/http'
import { rows, join, departing } from './harness'

import type { Harness } from './harness'

export const occupancyContract = ({ start }: Harness) => {
  describe('the capacity a membership occupies', () => {
    test('records a new membership as occupying its seat', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      await joinedMember(await join(auth, created.code))
      const stored = onlyRow(await rows(auth, 'roomMember'))
      expect(stored.occupancy).toBe(1)
      expect(stored.releasedAt ?? null).toBeNull()
    })
    test('never counts fewer seats than the memberships holding them', async () => {
      const auth = await start()
      const elsewhere = await auth.api.createRoom({ body: {} })
      const target = await auth.api.createRoom({ body: {} })
      const cookie = jarOf(await join(auth, elsewhere.code))
      const responses = await Promise.all([
        join(auth, target.code, cookie),
        join(auth, target.code, cookie)
      ])
      expect(responses.map(response => response.status)).toEqual([200, 200])
      const inTarget = (await rows(auth, 'roomMember')).filter(
        row => row.roomId === target.room.id
      )
      expect(inTarget).toHaveLength(1)
      const room = (await rows(auth, 'room')).find(
        row => row.id === target.room.id
      )
      expect(Number(room?.memberCount)).toBeGreaterThanOrEqual(inTarget.length)
    })
    test('refuses a membership that would expire before it began', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const member = await joinedMember(await join(auth, created.code))
      const refused = await auth.api.addRoomMember({
        body: {
          roomId: created.room.id,
          actorId: member.actorId,
          role: 'facilitator',
          expiresAt: new Date(Date.now() - 1000)
        },
        asResponse: true
      })
      expect(refused.status).toBe(400)
      expect(await codeOf(refused)).toBe('MEMBERSHIP_EXPIRES_IN_THE_PAST')
      expect(await rows(auth, 'roomMember')).toHaveLength(1)
      const room = (await rows(auth, 'room')).find(
        row => row.id === created.room.id
      )
      expect(room?.memberCount).toBe(1)
    })
  })
}

export const leaveContract = ({ start }: Harness) => {
  describe('leaving a room', () => {
    test('returns the seat it occupied and frees it for someone else', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({
        body: { maxMembers: 1 }
      })
      const joined = await join(auth, created.code)
      const cookie = jarOf(joined)
      const member = await joinedMember(joined)
      const full = await join(auth, created.code)
      expect(full.status).toBe(409)
      expect(await codeOf(full)).toBe('ROOM_AT_CAPACITY')

      const left = await departing(auth, created.room.id, cookie)
      expect(left.status).toBe(200)

      const stored = onlyRow(await rows(auth, 'roomMember'))
      expect(stored.id).toBe(member.id)
      expect(stored.leftAt).not.toBeNull()
      expect(stored.occupancy).toBe(0)
      expect(stored.releasedAt).not.toBeNull()
      const room = onlyRow(await rows(auth, 'room'))
      expect(room.memberCount).toBe(0)

      const next = await join(auth, created.code)
      expect(next.status).toBe(200)
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)
    })
    test('returns one seat however many times it is asked', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      const cookie = jarOf(await join(auth, created.code))

      const responses = await Promise.all([
        departing(auth, created.room.id, cookie),
        departing(auth, created.room.id, cookie),
        departing(auth, created.room.id, cookie)
      ])

      expect(responses.map(response => response.status)).toEqual([
        200, 200, 200
      ])
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(0)
      expect(onlyRow(await rows(auth, 'roomMember')).occupancy).toBe(0)
    })
    test('rejoining after leaving takes a seat again', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      const cookie = jarOf(await join(auth, created.code))
      await departing(auth, created.room.id, cookie)

      const again = await join(auth, created.code, cookie)
      expect(again.status).toBe(200)

      const stored = onlyRow(await rows(auth, 'roomMember'))
      expect(stored.leftAt).toBeNull()
      expect(stored.occupancy).toBe(1)
      expect(stored.releasedAt).toBeNull()
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)
    })
  })
}

export const leaveRefusalContract = ({ start }: Harness) => {
  describe('leaving refused', () => {
    test('refuses a room that does not exist', async () => {
      const auth = await start({})
      const refused = await departing(auth, 'nowhere')
      expect(refused.status).toBe(404)
      expect(await codeOf(refused)).toBe('UNKNOWN_ROOM')
    })
    test('refuses a caller who never joined', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      await join(auth, created.code)
      const refused = await departing(auth, created.room.id)
      expect(refused.status).toBe(403)
      expect(await codeOf(refused)).toBe('NOT_A_MEMBER')
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)
    })
    test('refuses a revoked membership without returning its seat twice', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      const cookie = jarOf(await join(auth, created.code))
      const { adapter } = await auth.$context
      await adapter.updateMany({
        model: 'roomMember',
        where: [{ field: 'roomId', value: created.room.id }],
        update: { revokedAt: new Date() }
      })

      const refused = await departing(auth, created.room.id, cookie)
      expect(refused.status).toBe(403)
      expect(await codeOf(refused)).toBe('MEMBERSHIP_REVOKED')
      expect(onlyRow(await rows(auth, 'roomMember')).occupancy).toBe(1)
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)
    })
  })
}

export const revocationContract = ({ start }: Harness) => {
  describe('revoking a membership', () => {
    test('returns its seat and refuses the same actor a rejoin', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      const joined = await join(auth, created.code)
      const cookie = jarOf(joined)
      const member = await joinedMember(joined)

      const revoked = await auth.api.revokeRoomMember({
        body: { roomId: created.room.id, actorId: member.actorId }
      })
      expect(revoked.membership.revokedAt).not.toBeNull()

      const stored = onlyRow(await rows(auth, 'roomMember'))
      expect(stored.occupancy).toBe(0)
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(0)

      const refused = await join(auth, created.code, cookie)
      expect(refused.status).toBe(403)
      expect(await codeOf(refused)).toBe('MEMBERSHIP_REVOKED')
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(0)
    })
    test('spends one seat when a leave and a revocation both land', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      const joined = await join(auth, created.code)
      const cookie = jarOf(joined)
      const member = await joinedMember(joined)

      await departing(auth, created.room.id, cookie)
      await auth.api.revokeRoomMember({
        body: { roomId: created.room.id, actorId: member.actorId }
      })

      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(0)
      expect(onlyRow(await rows(auth, 'roomMember')).occupancy).toBe(0)
    })
  })
}

export const reconciliationContract = ({ start }: Harness) => {
  describe('reconciling the capacity an expiry dropped', () => {
    test('returns the seat an expired membership never gave back', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: { maxMembers: 1 } })
      const joined = await join(auth, created.code)
      const member = await joinedMember(joined)
      const { adapter } = await auth.$context
      await adapter.updateMany({
        model: 'roomMember',
        where: [{ field: 'id', value: member.id }],
        update: { expiresAt: new Date(Date.now() - 60_000) }
      })

      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)

      const first = await auth.api.reconcileRoomCapacity({ body: {} })
      expect(first).toEqual({ owing: 1, released: 1 })
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(0)
      expect(onlyRow(await rows(auth, 'roomMember')).occupancy).toBe(0)

      const second = await auth.api.reconcileRoomCapacity({ body: {} })
      expect(second).toEqual({ owing: 0, released: 0 })
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(0)
      expect((await join(auth, created.code)).status).toBe(200)
    })
  })
}

export const capacityRaceContract = ({ start }: Harness) => {
  describe('leaving while rejoining', () => {
    test('never leaves a membership admitted without a counted seat', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: { maxMembers: 2 } })
      const cookie = jarOf(await join(auth, created.code))

      await Promise.all([
        departing(auth, created.room.id, cookie),
        join(auth, created.code, cookie)
      ])

      const member = onlyRow(await rows(auth, 'roomMember'))
      const room = onlyRow(await rows(auth, 'room'))
      const standing = member.leftAt === null ? 1 : 0
      expect(member.occupancy).toBe(standing)
      expect(room.memberCount).toBe(standing)
    })
  })
}
