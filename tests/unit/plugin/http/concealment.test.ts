import { describe, expect, test } from 'bun:test'

import { concealed } from '@/plugin/http/concealment'

import { codeOf, postRoute } from '../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../helpers/memory'

const overHttp = { request: new Request('http://localhost:3000') }
const fromServer = { request: undefined }

describe('concealing a room from an http caller', () => {
  test('answers a missing room as one the caller holds nothing in', () => {
    expect(concealed('unknown-room', overHttp)).toBe('not-a-member')
  })

  test('still names a missing room to the server', () => {
    expect(concealed('unknown-room', fromServer)).toBe('unknown-room')
  })

  test('leaves every other refusal as it was', () => {
    expect(concealed('revoked', overHttp)).toBe('revoked')
  })

  test('makes leaving a missing room answer as leaving a foreign one', async () => {
    const db = empty()
    await seedRoom(db)
    const auth = memoryAuth(db)

    const [missing, foreign] = await Promise.all([
      postRoute(auth, 'leave', { roomId: 'no-such-room' }),
      postRoute(auth, 'leave', { roomId: 'room-1' })
    ])

    expect(missing.status).toBe(foreign.status)
    expect(await codeOf(missing)).toBe(await codeOf(foreign))
  })
})
