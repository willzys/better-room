import { describe, expect, test } from 'bun:test'

import { registered } from '../../helpers/auth'
import { codeOf, joinedMember, onlyRow, stringField } from '../../helpers/http'
import { sqliteFixture } from '../../helpers/sqlite'

const fixture = sqliteFixture()
const { auth, rows } = fixture

const signUp = (email: string) => registered(auth(), email)

describe('adding a member server side', () => {
  test('materialises a membership with the role the app named', async () => {
    const instance = auth()
    const created = await instance.api.createRoom({ body: {} })
    const userId = await signUp('organizer@example.com')

    const added = await instance.api.addRoomMember({
      body: { roomId: created.room.id, userId, role: 'organizer' }
    })

    expect(added.membership.role).toBe('organizer')
    expect(added.membership.roomId).toBe(created.room.id)
    expect(rows('roomMember')).toHaveLength(1)
    expect(rows('room')[0]?.memberCount).toBe(1)
  })

  test('reuses the actor of the user and leaves the creator record alone', async () => {
    const instance = auth()
    const userId = await signUp('organizer@example.com')
    const created = await instance.api.createRoom({ body: { userId } })

    await instance.api.addRoomMember({
      body: { roomId: created.room.id, userId, role: 'organizer' }
    })

    expect(rows('roomActor')).toHaveLength(1)
    const actorId = stringField(onlyRow(rows('roomActor')), 'id')
    expect(created.room.createdBy).toBe(actorId)
    expect(onlyRow(rows('roomMember')).actorId).toBe(actorId)
  })

  test('stores the validity window, which only this path can set', async () => {
    const instance = auth()
    const created = await instance.api.createRoom({ body: {} })
    const userId = await signUp('organizer@example.com')
    const expiresAt = new Date(Date.now() + 3600_000)

    const added = await instance.api.addRoomMember({
      body: { roomId: created.room.id, userId, role: 'organizer', expiresAt }
    })

    expect(added.membership.expiresAt).toEqual(expiresAt)
  })
})

describe('addition capacity and idempotence', () => {
  test('counts the added member against capacity', async () => {
    const instance = auth()
    const created = await instance.api.createRoom({ body: { maxMembers: 1 } })
    const userId = await signUp('organizer@example.com')

    await instance.api.addRoomMember({
      body: { roomId: created.room.id, userId, role: 'organizer' }
    })

    const joined = await instance.api.joinRoom({
      body: { code: created.code },
      asResponse: true
    })

    expect(joined.status).toBe(409)
    expect(await codeOf(joined)).toBe('ROOM_AT_CAPACITY')
  })

  test('refuses a second addition for the same actor', async () => {
    const instance = auth()
    const created = await instance.api.createRoom({ body: {} })
    const userId = await signUp('organizer@example.com')
    const body = { roomId: created.room.id, userId, role: 'organizer' }

    await instance.api.addRoomMember({ body })

    const again = await instance.api.addRoomMember({
      body: { ...body, role: 'participant' },
      asResponse: true
    })

    expect(again.status).toBe(409)
    expect(await codeOf(again)).toBe('ALREADY_A_MEMBER')
    expect(rows('roomMember')).toHaveLength(1)
    expect(rows('roomMember')[0]?.role).toBe('organizer')
  })
})

describe('adding a member named by actor', () => {
  test('names the member by an existing actorId', async () => {
    const instance = auth()
    const lobby = await instance.api.createRoom({ body: {} })
    const breakout = await instance.api.createRoom({ body: {} })

    const joined = await instance.api.joinRoom({
      body: { code: lobby.code },
      asResponse: true
    })
    const actorId = (await joinedMember(joined)).actorId

    const added = await instance.api.addRoomMember({
      body: { roomId: breakout.room.id, actorId, role: 'facilitator' }
    })

    expect(added.membership.actorId).toBe(actorId)
    expect(added.membership.role).toBe('facilitator')
    expect(rows('roomActor')).toHaveLength(1)
  })

  test('refuses an actorId that names no actor', async () => {
    const instance = auth()
    const created = await instance.api.createRoom({ body: {} })

    const response = await instance.api.addRoomMember({
      body: { roomId: created.room.id, actorId: 'nowhere', role: 'organizer' },
      asResponse: true
    })

    expect(response.status).toBe(404)
    expect(await codeOf(response)).toBe('UNKNOWN_ACTOR')
    expect(rows('roomMember')).toHaveLength(0)
  })
})

describe('the role a room code grants', () => {
  test('keeps the elevated role out of reach of a room code', async () => {
    const instance = auth()
    const created = await instance.api.createRoom({ body: {} })

    const joined = await instance.api.joinRoom({
      body: { code: created.code },
      asResponse: true
    })

    expect((await joinedMember(joined)).role).toBe('participant')
  })
})
