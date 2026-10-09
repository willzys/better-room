import { describe, expect, spyOn, test } from 'bun:test'

import { betterRoom } from '@/plugin'

import { registered, signedIn } from '../../../helpers/auth'
import { codeOf, jarOf, joinedMember, onlyRow } from '../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../helpers/memory'

import type { RoomEvent } from '@/plugin/hooks/events'

const listening = async (
  listener: (event: RoomEvent) => void | Promise<void> = () => undefined
) => {
  const db = empty()
  const code = await seedRoom(db, { room: { maxMembers: 2 } })
  const events: RoomEvent[] = []
  const auth = memoryAuth(db, {
    onChange: async event => {
      events.push(event)
      await listener(event)
    }
  })
  const join = (cookie?: string) =>
    auth.api.joinRoom({
      body: { code },
      asResponse: true,
      ...(cookie === undefined ? {} : { headers: new Headers({ cookie }) })
    })
  return { db, auth, code, events, join }
}

describe('signalling membership changes', () => {
  test('announces a join once, with the membership it reports', async () => {
    const { events, join } = await listening()
    const response = await join()
    const cookie = jarOf(response)
    const member = await joinedMember(response)

    expect((await join(cookie)).status).toBe(200)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'joined',
      roomId: 'room-1',
      membership: { id: member.id, actorId: member.actorId }
    })
  })

  test('announces a departure once, however often it is asked for', async () => {
    const { auth, events, join } = await listening()
    const cookie = jarOf(await join())
    const leave = () =>
      auth.api.leaveRoom({
        body: { roomId: 'room-1' },
        headers: new Headers({ cookie })
      })

    await leave()
    await leave()

    expect(events.map(event => event.type)).toEqual(['joined', 'left'])
  })

  test('announces a server side addition and a revocation', async () => {
    const { auth, events } = await listening()
    const userId = await registered(auth, 'added@example.com')

    const { membership } = await auth.api.addRoomMember({
      body: { roomId: 'room-1', userId, role: 'facilitator' }
    })
    await auth.api.revokeRoomMember({
      body: { roomId: 'room-1', actorId: membership.actorId }
    })

    expect(events.map(event => event.type)).toEqual(['added', 'revoked'])
    expect(events[0]).toMatchObject({
      roomId: 'room-1',
      membership: { actorId: membership.actorId, role: 'facilitator' }
    })
    expect(events[1]).toMatchObject({
      membership: { actorId: membership.actorId }
    })
  })

  test('announces nothing for a refused join', async () => {
    const { auth, events } = await listening()
    const refused = await auth.api.joinRoom({
      body: { code: 'not-a-code' },
      asResponse: true
    })

    expect(await codeOf(refused)).toBe('CODE_DID_NOT_RESOLVE')
    expect(events).toEqual([])
  })
})

describe('signalling what reconciliation collects', () => {
  test('announces the expiry of a membership once reconciliation takes its seat back', async () => {
    const { auth, db, events, join } = await listening()
    const member = await joinedMember(await join())
    const row = onlyRow(db.roomMember)
    row.expiresAt = new Date(Date.now() - 60_000)

    await auth.api.reconcileRoomCapacity({ body: {} })
    await auth.api.reconcileRoomCapacity({ body: {} })

    expect(events.map(event => event.type)).toEqual(['joined', 'expired'])
    expect(events[1]).toMatchObject({
      type: 'expired',
      roomId: 'room-1',
      membership: { id: member.id, actorId: member.actorId }
    })
  })

  test('announces no expiry for a seat a revocation still owed', async () => {
    const { auth, db, events, join } = await listening()
    await join()
    const row = onlyRow(db.roomMember)
    row.expiresAt = new Date(Date.now() - 60_000)
    row.revokedAt = row.expiresAt

    const reconciled = await auth.api.reconcileRoomCapacity({ body: {} })

    expect(reconciled).toEqual({ owing: 1, released: 1 })
    expect(events.map(event => event.type)).toEqual(['joined'])
  })
})

describe('signalling room changes', () => {
  test('announces each state a room enters, and nothing for a state it already holds', async () => {
    const { auth, events } = await listening()
    const body = { roomId: 'room-1' }

    await auth.api.lockRoom({ body })
    await auth.api.lockRoom({ body })
    await auth.api.unlockRoom({ body })
    await auth.api.closeRoom({ body })

    expect(events.map(event => event.type)).toEqual([
      'locked',
      'unlocked',
      'closed'
    ])
    expect(events[2]).toMatchObject({
      room: { id: 'room-1', status: 'closed' }
    })
  })

  test('announces a creation without the code it issued', async () => {
    const { auth, events } = await listening()

    const { room, code } = await auth.api.createRoom({ body: {} })

    expect(events).toEqual([{ type: 'created', roomId: room.id, room }])
    expect(JSON.stringify(events)).not.toContain(code)
  })

  test('announces a rotation without the code it issued', async () => {
    const { auth, events } = await listening()

    const { code } = await auth.api.rotateRoomCode({
      body: { roomId: 'room-1' }
    })

    expect(events).toEqual([{ type: 'rotated', roomId: 'room-1' }])
    expect(JSON.stringify(events)).not.toContain(code)
  })
})

describe('signalling actor changes', () => {
  test('announces a promotion naming both actors', async () => {
    const { auth, events, join } = await listening()
    const grant = jarOf(await join())
    const session = await signedIn(auth, 'promoted@example.com')

    const promoted = await auth.api.promoteRoomActor({
      headers: new Headers({ cookie: `${session}; ${grant}` })
    })

    expect(events.at(-1)).toEqual({
      type: 'promoted',
      actorId: promoted.actorId,
      merged: promoted.merged
    })
  })

  test('announces the erasure of the actor a deleted user owned', async () => {
    const { auth, events, join } = await listening()
    const session = await signedIn(auth, 'erased@example.com')
    const { actorId } = await joinedMember(await join(session))

    await auth.api.deleteUser({
      body: {},
      headers: new Headers({ cookie: session })
    })

    expect(events.at(-1)).toEqual({ type: 'erased', actorId })
  })
})

describe('a listener that fails', () => {
  test('never undoes or refuses the change it was told about', async () => {
    const logged = spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { db, events, join } = await listening(() => {
        throw new Error('socket closed')
      })

      expect((await join()).status).toBe(200)
      expect(db.roomMember).toHaveLength(1)
      expect(events).toHaveLength(1)
      expect(
        logged.mock.calls.some(call =>
          String(call[0]).includes('could not deliver a joined event')
        )
      ).toBe(true)
    } finally {
      logged.mockRestore()
    }
  })
})

describe('the listener option', () => {
  test.each(['broadcast', 1, {}])(
    'refuses %p at construction, since it is not a function',
    onChange => {
      expect(() =>
        Reflect.apply(betterRoom, undefined, [{ onChange }])
      ).toThrow(new TypeError('onChange must be a function'))
    }
  )
})
