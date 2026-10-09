import { describe, expect, test } from 'bun:test'

import { onlyRow, postRoute } from '../../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../../helpers/memory'

describe('rotating a code over http', () => {
  test('finds no route, leaving the active code as it was', async () => {
    const db = empty()
    await seedRoom(db)
    const auth = memoryAuth(db)

    const response = await postRoute(auth, 'rotate-code', { roomId: 'room-1' })

    expect(response.status).toBe(404)
    expect(onlyRow(db.roomCode).status).toBe('active')
  })
})
