import { describe, expect, spyOn, test } from 'bun:test'

import { signedIn } from '../../helpers/auth'
import { codeOf, jarOf, joinedMember, onlyRow } from '../../helpers/http'
import { departing, rows, join } from './harness'

import type { Harness } from './harness'

export const admissionContract = ({ start }: Harness) => {
  describe('admission', () => {
    test('normalises absent columns and reuses the membership without consuming another seat', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: { maxMembers: 1 } })
      const first = await join(auth, created.code)
      const cookie = jarOf(first)
      const member = await joinedMember(first)
      expect(member).toMatchObject({
        roomId: created.room.id,
        role: 'participant',
        expiresAt: null,
        leftAt: null,
        revokedAt: null
      })
      expect(
        await joinedMember(await join(auth, created.code, cookie))
      ).toEqual(member)
      expect(await rows(auth, 'roomActor')).toHaveLength(1)
      expect(await rows(auth, 'roomMember')).toHaveLength(1)
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)
    })
    test('shares the anonymous actor across rooms without sharing membership', async () => {
      const auth = await start()
      const first = await auth.api.createRoom({ body: {} })
      const second = await auth.api.createRoom({ body: {} })
      const response = await join(auth, first.code)
      const cookie = jarOf(response)
      const member = await joinedMember(response)
      const other = await joinedMember(await join(auth, second.code, cookie))
      expect(other.actorId).toBe(member.actorId)
      expect(other.roomId).toBe(second.room.id)
      expect(other.id).not.toBe(member.id)
      expect(await rows(auth, 'roomActor')).toHaveLength(1)
    })
  })
}

export const refusalContract = ({ start }: Harness) => {
  describe('admission boundaries', () => {
    test.each(['ZZZZZZZZ', 'not-a-code'])(
      'refuses %p without materialising an actor',
      async code => {
        const auth = await start()
        const refused = await join(auth, code)
        expect(refused.status).toBe(400)
        expect(await codeOf(refused)).toBe('CODE_DID_NOT_RESOLVE')
        expect(await rows(auth, 'roomActor')).toHaveLength(0)
        expect(await rows(auth, 'roomMember')).toHaveLength(0)
      }
    )
    test('admits exactly the capacity under a simultaneous burst and names every refusal', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: { maxMembers: 2 } })
      const responses = await Promise.all(
        Array.from({ length: 8 }, () => join(auth, created.code))
      )
      expect(
        responses.filter(response => response.status === 200)
      ).toHaveLength(2)
      const refused = responses.filter(response => response.status !== 200)
      expect(refused.map(response => response.status)).toEqual(
        Array.from({ length: 6 }, () => 409)
      )
      expect(await Promise.all(refused.map(codeOf))).toEqual(
        Array.from({ length: 6 }, () => 'ROOM_AT_CAPACITY')
      )
      expect(await rows(auth, 'roomMember')).toHaveLength(2)
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(2)
    })
  })
}

export const backoffContract = ({ start }: Harness) => {
  describe('backoff', () => {
    test('persists exact counts and leaves blocked attempts unchanged', async () => {
      const auth = await start({ attempts: { perIp: 2, window: 60 } })
      const headers = new Headers({ 'x-forwarded-for': '203.0.113.7' })
      const guess = () =>
        auth.api.joinRoom({
          body: { code: 'ZZZZZZZZ' },
          headers,
          asResponse: true
        })
      expect((await guess()).status).toBe(400)
      expect((await guess()).status).toBe(400)
      const counted = await rows(auth, 'roomAttempt')
      expect(new Set(counted.map(row => row.key))).toEqual(
        new Set(['global', 'ip:203.0.113.7'])
      )
      expect(counted.map(row => row.count)).toEqual([2, 2])
      const blocked = await guess()
      expect(blocked.status).toBe(429)
      expect(await codeOf(blocked)).toBe('TOO_MANY_ATTEMPTS')
      expect(await rows(auth, 'roomAttempt')).toEqual(counted)
    })
    test('keeps a fresh address admissible when a sweep spends the global budget', async () => {
      const auth = await start({ attempts: { everyone: 1, perIp: 10 } })
      const created = await auth.api.createRoom({ body: {} })
      const request = (code: string, ip: string) =>
        auth.api.joinRoom({
          body: { code },
          headers: new Headers({ 'x-forwarded-for': ip }),
          asResponse: true
        })
      expect((await request('not-a-code', '203.0.113.7')).status).toBe(400)
      expect((await request(created.code, '203.0.113.7')).status).toBe(429)
      expect((await request(created.code, '198.51.100.9')).status).toBe(200)
    })
  })
}

export const additionContract = ({ start }: Harness) => {
  describe('server side addition', () => {
    test('preserves an elevated role and refuses to resurrect its expired membership', async () => {
      const auth = await start()
      const lobby = await auth.api.createRoom({ body: {} })
      const breakout = await auth.api.createRoom({ body: {} })
      const response = await join(auth, lobby.code)
      const cookie = jarOf(response)
      const { actorId } = await joinedMember(response)
      const until = new Date(Date.now() + 60_000)
      const added = await auth.api.addRoomMember({
        body: {
          roomId: breakout.room.id,
          actorId,
          role: 'facilitator',
          expiresAt: until
        }
      })
      expect(added.membership).toMatchObject({
        actorId,
        role: 'facilitator',
        expiresAt: until
      })
      const { adapter } = await auth.$context
      await adapter.updateMany({
        model: 'roomMember',
        where: [{ field: 'id', value: added.membership.id }],
        update: { expiresAt: new Date(0) }
      })
      const refused = await join(auth, breakout.code, cookie)
      expect(refused.status).toBe(403)
      expect(await codeOf(refused)).toBe('MEMBERSHIP_EXPIRED')
      expect(await rows(auth, 'roomMember')).toHaveLength(2)
      const persisted = (await rows(auth, 'roomMember')).find(
        row => row.id === added.membership.id
      )
      expect(persisted?.role).toBe('facilitator')
    })
  })
}

export const readmissionContract = ({ start }: Harness) => {
  describe('server side readmission', () => {
    test('readmits a member who left on the same row, with the role it names now', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: { maxMembers: 1 } })
      const joined = await join(auth, created.code)
      const cookie = jarOf(joined)
      const member = await joinedMember(joined)
      expect((await departing(auth, created.room.id, cookie)).status).toBe(200)

      const { membership } = await auth.api.addRoomMember({
        body: {
          roomId: created.room.id,
          actorId: member.actorId,
          role: 'organizer'
        }
      })

      expect(membership).toMatchObject({
        id: member.id,
        role: 'organizer',
        leftAt: null
      })
      expect(onlyRow(await rows(auth, 'roomMember')).occupancy).toBe(1)
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)
    })
  })
}

export const enrolmentRaceContract = ({ start }: Harness) => {
  describe('one actor enrolling several times at once', () => {
    test('takes a single seat however many of its joins arrive together', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: { maxMembers: 8 } })
      const cookie = await signedIn(auth, 'eager@example.com')

      const responses = await Promise.all(
        Array.from({ length: 6 }, () => join(auth, created.code, cookie))
      )

      expect(responses.map(response => response.status)).toEqual(
        Array.from({ length: 6 }, () => 200)
      )
      const member = onlyRow(await rows(auth, 'roomMember'))
      expect(member.occupancy).toBe(1)
      expect(member.leftAt).toBeNull()
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)
    })
    test('adds once and refuses the others as already a member', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      const { actorId } = await joinedMember(
        await join(auth, (await auth.api.createRoom({ body: {} })).code)
      )

      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          auth.api.addRoomMember({
            body: { roomId: created.room.id, actorId, role: `role-${index}` },
            asResponse: true
          })
        )
      )

      const added = responses.filter(response => response.status === 200)
      const refused = responses.filter(response => response.status !== 200)
      expect(added).toHaveLength(1)
      expect(await Promise.all(refused.map(codeOf))).toEqual(
        Array.from({ length: 5 }, () => 'ALREADY_A_MEMBER')
      )
      const reported = await joinedMember(onlyRow(added))
      const stored = (await rows(auth, 'roomMember')).filter(
        row => row.roomId === created.room.id
      )
      expect(onlyRow(stored)).toMatchObject({
        role: reported.role,
        occupancy: 1,
        leftAt: null
      })
      const counted = (await rows(auth, 'room')).find(
        row => row.id === created.room.id
      )
      expect(counted?.memberCount).toBe(1)
    })
  })
}

export const roomStateRaceContract = ({ start }: Harness) => {
  describe('a room that changes state while a caller joins', () => {
    test('refuses by the state the room moved to and counts no seat', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: { maxMembers: 4 } })
      const { adapter } = await auth.$context
      const real = adapter.incrementOne.bind(adapter)
      const state = { locked: false }
      const spy = spyOn(adapter, 'incrementOne').mockImplementation(
        async query => {
          if (query.model === 'room' && !state.locked) {
            state.locked = true
            await auth.api.lockRoom({ body: { roomId: created.room.id } })
          }

          return real(query)
        }
      )

      const refused = await join(auth, created.code).finally(() =>
        spy.mockRestore()
      )

      expect(state.locked).toBe(true)
      expect(refused.status).toBe(403)
      expect(await codeOf(refused)).toBe('ROOM_LOCKED')
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(0)
      expect(await rows(auth, 'roomMember')).toHaveLength(0)
    })
  })
}
