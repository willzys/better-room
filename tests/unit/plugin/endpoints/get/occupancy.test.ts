import { describe, expect, test } from 'bun:test'

import { codeOf, getRoute, jarOf } from '../../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../../helpers/memory'

const scenario = async () => {
  const db = empty()
  const code = await seedRoom(db)
  const auth = memoryAuth(db)
  const read = (roomId: string, cookie?: string) =>
    getRoute(
      auth,
      `occupancy?roomId=${roomId}`,
      cookie === undefined ? {} : { cookie }
    )

  return { auth, code, read }
}

describe('reading the occupancy of a room over http', () => {
  test('answers a caller who holds a membership there', async () => {
    const { auth, code, read } = await scenario()
    const cookie = jarOf(
      await auth.api.joinRoom({ body: { code }, asResponse: true })
    )

    const response = await read('room-1', cookie)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      roomId: 'room-1',
      occupied: 1,
      maxMembers: null
    })
  })

  test('refuses a caller outside the room', async () => {
    const { read } = await scenario()

    const response = await read('room-1')

    expect(response.status).toBe(403)
    expect(await codeOf(response)).toBe('NOT_A_MEMBER')
  })

  test('refuses a room that does not exist exactly as a foreign one', async () => {
    const { read } = await scenario()

    const response = await read('no-such-room')

    expect(response.status).toBe(403)
    expect(await codeOf(response)).toBe('NOT_A_MEMBER')
  })

  test('still names a room that does not exist to the server', async () => {
    const { auth } = await scenario()

    const response = await auth.api.getRoomOccupancy({
      query: { roomId: 'no-such-room' },
      asResponse: true
    })

    expect(response.status).toBe(404)
    expect(await codeOf(response)).toBe('UNKNOWN_ROOM')
  })
})
