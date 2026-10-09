import { describe, expect, test } from 'bun:test'

import { codeOf } from '../../helpers/http'
import { sqliteFixture } from '../../helpers/sqlite'

const fixture = sqliteFixture()
const { auth } = fixture

describe('rotation refusals', () => {
  test('refuses a room that does not exist', async () => {
    const response = await auth().api.rotateRoomCode({
      body: { roomId: 'nowhere' },
      asResponse: true
    })

    expect(response.status).toBe(404)
    expect(await codeOf(response)).toBe('UNKNOWN_ROOM')
  })

  test('refuses a closed room', async () => {
    const instance = auth()
    const created = await instance.api.createRoom({ body: {} })

    fixture.database.run("update room set status = 'closed'")

    const response = await instance.api.rotateRoomCode({
      body: { roomId: created.room.id },
      asResponse: true
    })

    expect(response.status).toBe(403)
    expect(await codeOf(response)).toBe('ROOM_CLOSED')
  })
})
