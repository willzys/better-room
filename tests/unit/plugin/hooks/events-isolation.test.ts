import { describe, expect, test } from 'bun:test'

import { empty, memoryAuth } from '../../../helpers/memory'

describe('isolating a hook from the request', () => {
  test('keeps the response and the stored row when a hook mutates its event', async () => {
    const db = empty()
    const auth = memoryAuth(db, {
      hooks: {
        onCreated: event => {
          event.room.createdAt.setUTCFullYear(1900)
          Object.assign(event.room, { status: 'closed' })
        }
      }
    })

    const { room } = await auth.api.createRoom({ body: {} })
    const stored = db.room.find(row => row.id === room.id)

    expect(room.createdAt.getUTCFullYear()).not.toBe(1900)
    expect(room.status).toBe('active')
    expect(stored?.createdAt).toEqual(room.createdAt)
  })
})
