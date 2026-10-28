import { describe, expect, test } from 'bun:test'

import { codeOf, getRoute, jarOf, postRoute } from '../../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../../helpers/memory'

describe('GET /better-room/members over HTTP', () => {
  test('lists a room to its members and answers anyone else as not a member', async () => {
    const db = empty()
    const code = await seedRoom(db)
    const auth = memoryAuth(db)
    const member = jarOf(await postRoute(auth, 'join', { code, name: 'Ana' }))

    const [listed, stranger, missing] = await Promise.all([
      getRoute(auth, 'members?roomId=room-1', { cookie: member }),
      getRoute(auth, 'members?roomId=room-1'),
      getRoute(auth, 'members?roomId=no-such-room')
    ])

    expect(listed.status).toBe(200)
    expect(await listed.text()).toContain('"name":"Ana"')
    expect([stranger.status, missing.status]).toEqual([403, 403])
    expect([await codeOf(stranger), await codeOf(missing)]).toEqual([
      'NOT_A_MEMBER',
      'NOT_A_MEMBER'
    ])
  })
})
