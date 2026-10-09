import { describe, expect, test } from 'bun:test'

import {
  codeOf,
  joinedMember,
  onlyRow,
  postRoute
} from '../../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../../helpers/memory'

const scenario = async () => {
  const db = empty()
  const code = await seedRoom(db, { plaintext: 'ABCD1234' })
  const auth = memoryAuth(db)
  const request = (body: unknown) => postRoute(auth, 'join', body)
  return { db, code, request }
}

describe('POST /better-room/join over HTTP', () => {
  test('normalises a rendered code and ignores an attempted role escalation', async () => {
    const { db, request } = await scenario()
    const response = await request({
      code: 'ab-cd 1234',
      role: 'organizer',
      actorId: 'someone-else'
    })
    const member = await joinedMember(response)
    expect(member).toMatchObject({ roomId: 'room-1', role: 'participant' })
    expect(member.actorId).not.toBe('someone-else')
    expect(onlyRow(db.roomActor).userId).toBeNull()
    expect(onlyRow(db.room).memberCount).toBe(1)
    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(1)
    expect(cookies[0]).toContain('room_grant=')
    expect(cookies[0]).toContain('HttpOnly')
    expect(cookies[0]).toContain('SameSite=Lax')
  })

  test.each([{}, { code: 1234 }, { code: null }])(
    'rejects a malformed body %p before touching room state',
    async body => {
      const { db, request } = await scenario()
      const response = await request(body)

      expect(response.status).toBe(400)
      expect(await codeOf(response)).toBe('VALIDATION_ERROR')
      expect(db.roomActor).toHaveLength(0)
      expect(db.roomMember).toHaveLength(0)
      expect(onlyRow(db.room).memberCount).toBe(0)
    }
  )
})
