import { describe, expect, test } from 'bun:test'

import { concealed, disclosed } from '@/plugin/http/concealment'

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

describe('concealing the state of a room from a join', () => {
  test.each(['locked', 'closed', 'expired', 'at-capacity'] as const)(
    'answers %s as a code that did not resolve when asked to',
    refusal => {
      expect(disclosed(refusal, true)).toBe('unresolved')
      expect(disclosed(refusal, false)).toBe(refusal)
    }
  )

  test('keeps a refusal that only a holder of the room can see', () => {
    expect(disclosed('revoked', true)).toBe('revoked')
  })

  test('answers a locked room and a session it needs as an unknown code, and counts both', async () => {
    const db = empty()
    const code = await seedRoom(db, { room: { status: 'locked' } })
    const concealing = memoryAuth(db, { join: { concealRefusals: true } })
    const requiring = memoryAuth(db, {
      join: { concealRefusals: true, requireSession: true }
    })
    const from = { 'x-forwarded-for': '203.0.113.7' }

    const locked = await postRoute(concealing, 'join', { code }, from)
    db.room[0] = { ...db.room[0], status: 'active' }
    const anonymous = await postRoute(requiring, 'join', { code }, from)

    expect([locked.status, anonymous.status]).toEqual([400, 400])
    expect([await codeOf(locked), await codeOf(anonymous)]).toEqual([
      'CODE_DID_NOT_RESOLVE',
      'CODE_DID_NOT_RESOLVE'
    ])
    expect(db.roomAttempt.find(row => row.key === 'global')?.count).toBe(2)
  })
})
