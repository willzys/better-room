import { describe, expect, test } from 'bun:test'

import { codeOf, jarOf, joinedMember } from '../../helpers/http'
import { held, holding, join, listedPage, walkedListing } from './harness'

import type { Harness } from './harness'

export const accessContract = ({ start }: Harness) => {
  describe('the authorized path', () => {
    test('reports the membership a joined caller holds', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const joined = await join(auth, created.code)
      const cookie = jarOf(joined)
      const member = await joinedMember(joined)
      const access = await auth.api.getRoomAccess({
        query: { roomId: created.room.id },
        headers: new Headers({ cookie }),
        asResponse: true
      })
      expect(access.status).toBe(200)
      const reported = await access.json()
      expect(reported.authorized).toBe(true)
      expect(reported.membership.id).toBe(member.id)
      expect(reported.membership.role).toBe('participant')
      expect(reported.room.id).toBe(created.room.id)
    })
    test('reports no membership for a caller that never joined', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const access = await auth.api.getRoomAccess({
        query: { roomId: created.room.id },
        asResponse: true
      })
      expect(access.status).toBe(200)
      const reported = await access.json()
      expect(reported.authorized).toBe(false)
      expect(reported.membership).toBeNull()
      expect(reported.room.id).toBe(created.room.id)
    })
  })
}

export const accessRefusalContract = ({ start }: Harness) => {
  describe('the authorized path refusing', () => {
    test('refuses a room that does not exist', async () => {
      const auth = await start()
      const access = await auth.api.getRoomAccess({
        query: { roomId: 'nowhere' },
        asResponse: true
      })
      expect(access.status).toBe(404)
      expect(await codeOf(access)).toBe('UNKNOWN_ROOM')
    })
    test('stops authorizing once the membership is revoked', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const joined = await join(auth, created.code)
      const cookie = jarOf(joined)
      const { adapter } = await auth.$context
      await adapter.updateMany({
        model: 'roomMember',
        where: [{ field: 'roomId', value: created.room.id }],
        update: { revokedAt: new Date() }
      })
      const access = await auth.api.getRoomAccess({
        query: { roomId: created.room.id },
        headers: new Headers({ cookie }),
        asResponse: true
      })
      const reported = await access.json()
      expect(reported.authorized).toBe(false)
      expect(reported.membership).not.toBeNull()
    })
  })
}

export const membershipsContract = ({ start }: Harness) => {
  describe('listing the memberships a caller holds', () => {
    test('pairs each membership with the room it names', async () => {
      const auth = await start()
      const first = await auth.api.createRoom({ body: {} })
      const second = await auth.api.createRoom({ body: {} })
      const joined = await join(auth, first.code)
      const cookie = jarOf(joined)
      const member = await joinedMember(joined)
      await join(auth, second.code, cookie)
      const page = await listedPage(auth, cookie)
      const listed = page.memberships
      expect(page.complete).toBe(true)
      expect(listed).toHaveLength(2)
      const listedRooms = listed.map(entry => entry.room.id)
      expect(listedRooms).toContain(first.room.id)
      expect(listedRooms).toContain(second.room.id)
      const mine = listed.find(entry => entry.room.id === first.room.id)
      expect(mine?.membership.id).toBe(member.id)
      expect(mine?.membership.role).toBe('participant')
      expect(mine?.room.memberCount).toBe(1)
    })
    test('lists nothing for a caller carrying no actor', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      await join(auth, created.code)
      const page = await listedPage(auth)
      expect(page.memberships).toEqual([])
      expect(page.complete).toBe(true)
    })
  })
}

export const membershipsRefusalContract = ({ start }: Harness) => {
  describe('listing the memberships a caller no longer holds', () => {
    test('stops listing a revoked membership', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const cookie = jarOf(await join(auth, created.code))
      const { adapter } = await auth.$context
      await adapter.updateMany({
        model: 'roomMember',
        where: [{ field: 'roomId', value: created.room.id }],
        update: { revokedAt: new Date() }
      })
      expect(await held(auth, cookie)).toEqual([])
    })
    test('stops listing a membership whose room has closed', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const cookie = jarOf(await join(auth, created.code))
      const { adapter } = await auth.$context
      await adapter.updateMany({
        model: 'room',
        where: [{ field: 'id', value: created.room.id }],
        update: { status: 'closed' }
      })
      expect(await held(auth, cookie)).toEqual([])
    })
  })
}

export const occupancyReadContract = ({ start }: Harness) => {
  describe('counting who holds a room', () => {
    test('counts the memberships holding it with and without a deadline, never the ones that left', async () => {
      const auth = await start()
      const lobby = await auth.api.createRoom({ body: {} })
      const target = await auth.api.createRoom({ body: { maxMembers: 5 } })
      await joinedMember(await join(auth, target.code))
      const leaving = jarOf(await join(auth, target.code))
      await auth.api.leaveRoom({
        body: { roomId: target.room.id },
        headers: new Headers({ cookie: leaving })
      })
      const { actorId } = await joinedMember(await join(auth, lobby.code))
      await auth.api.addRoomMember({
        body: {
          roomId: target.room.id,
          actorId,
          role: 'facilitator',
          expiresAt: new Date(Date.now() + 60_000)
        }
      })

      const read = await auth.api.getRoomOccupancy({
        query: { roomId: target.room.id }
      })

      expect(read).toEqual({
        roomId: target.room.id,
        occupied: 2,
        maxMembers: 5
      })
    })
  })
}

export const listingPagesContract = ({ start }: Harness) => {
  describe('paging the memberships a caller holds', () => {
    test('lists every membership exactly once across pages and branches', async () => {
      const auth = await start()
      const { cookie, perpetual, dated } = await holding(auth, 250, 200)

      const pages = await walkedListing(auth, cookie)
      const seen = pages.flat()

      expect(pages.map(page => page.length)).toEqual([200, 200, 50])
      expect(seen).toHaveLength(perpetual.length + dated.length)
      expect(new Set(seen.slice(0, perpetual.length))).toEqual(
        new Set(perpetual)
      )
      expect(new Set(seen.slice(perpetual.length))).toEqual(new Set(dated))
    })
  })
}
