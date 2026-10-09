import { describe, expect, test } from 'bun:test'

import { registered } from '../../../../helpers/auth'
import { codeOf, postRoute } from '../../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../../helpers/memory'

const scenario = async () => {
  const db = empty()
  await seedRoom(db)
  const auth = memoryAuth(db)
  const userId = await registered(auth, 'organizer@example.com')
  const add = (body: Record<string, unknown>) =>
    auth.api.addRoomMember({
      body: { roomId: 'room-1', role: 'organizer', ...body },
      asResponse: true
    })

  return { db, auth, userId, add }
}

describe('adding a member over http', () => {
  test('finds no route, since the caller could name any member and role', async () => {
    const { db, auth, userId } = await scenario()

    const response = await postRoute(auth, 'add-member', {
      roomId: 'room-1',
      userId,
      role: 'organizer'
    })

    expect(response.status).toBe(404)
    expect(db.roomMember).toHaveLength(0)
  })
})

describe('naming the member to add', () => {
  test('refuses naming the member twice over', async () => {
    const { db, userId, add } = await scenario()

    const response = await add({ userId, actorId: 'a' })

    expect(response.status).toBe(400)
    expect(await codeOf(response)).toBe('EXACTLY_ONE_IDENTITY')
    expect(db.roomMember).toHaveLength(0)
  })

  test('refuses naming no member at all', async () => {
    const { db, add } = await scenario()

    const response = await add({})

    expect(response.status).toBe(400)
    expect(await codeOf(response)).toBe('EXACTLY_ONE_IDENTITY')
    expect(db.roomMember).toHaveLength(0)
  })
})
