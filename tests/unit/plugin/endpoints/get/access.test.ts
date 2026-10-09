import { describe, expect, test } from 'bun:test'

import * as z from 'zod'

import { signedIn } from '../../../../helpers/auth'
import {
  codeOf,
  getRoute,
  jarOf,
  postRoute,
  reportedRoom
} from '../../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../../helpers/memory'

const CONCEALED = { authorized: false, room: null, membership: null }

const scenario = async () => {
  const db = empty()
  const code = await seedRoom(db)
  const auth = memoryAuth(db, { creation: { overHttp: true } })
  const read = (roomId: string, cookie?: string) =>
    getRoute(
      auth,
      `access?roomId=${roomId}`,
      cookie === undefined ? {} : { cookie }
    )
  const joined = async () =>
    jarOf(await auth.api.joinRoom({ body: { code }, asResponse: true }))

  return { auth, read, joined }
}

describe('reading access to a room over http', () => {
  test('tells a stranger nothing about a room that exists', async () => {
    const { read } = await scenario()

    const response = await read('room-1')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(CONCEALED)
  })

  test('answers a room that does not exist exactly as a foreign one', async () => {
    const { read } = await scenario()

    const response = await read('no-such-room')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(CONCEALED)
  })

  test('reports the room to a caller who holds a membership there', async () => {
    const { read, joined } = await scenario()

    const response = await read('room-1', await joined())

    expect((await reportedRoom(response)).id).toBe('room-1')
  })

  test('still reports the room to a caller who left it', async () => {
    const { auth, read, joined } = await scenario()
    const cookie = await joined()
    await auth.api.leaveRoom({
      body: { roomId: 'room-1' },
      headers: new Headers({ cookie })
    })

    const response = await read('room-1', cookie)
    const body = z
      .object({ authorized: z.boolean() })
      .parse(await response.clone().json())

    expect(body.authorized).toBe(false)
    expect((await reportedRoom(response)).id).toBe('room-1')
  })

  test('reports the room to the caller who created it', async () => {
    const { auth, read } = await scenario()
    const cookie = await signedIn(auth, 'host@example.com')
    const created = await postRoute(auth, 'create', {}, { cookie })
    const roomId = (await reportedRoom(created)).id

    const response = await read(roomId, cookie)

    expect((await reportedRoom(response)).id).toBe(roomId)
  })
})

describe('reading access to a room from the server', () => {
  test('reports a room the caller never held', async () => {
    const { auth } = await scenario()

    const access = await auth.api.getRoomAccess({ query: { roomId: 'room-1' } })

    expect(access.room?.id).toBe('room-1')
  })

  test('refuses a room that does not exist', async () => {
    const { auth } = await scenario()

    const response = await auth.api.getRoomAccess({
      query: { roomId: 'no-such-room' },
      asResponse: true
    })

    expect(response.status).toBe(404)
    expect(await codeOf(response)).toBe('UNKNOWN_ROOM')
  })
})
