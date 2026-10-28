import { describe, expect, test } from 'bun:test'

import { codeOf, onlyRow } from '../../helpers/http'
import { join, rows } from './harness'

import type { Harness } from './harness'

export const recountContract = ({ start }: Harness) => {
  describe('counting the seats of a room again', () => {
    test('brings a counter left above occupancy back to the seats held', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: { maxMembers: 3 } })
      const roomId = created.room.id

      await join(auth, created.code)
      const { adapter } = await auth.$context
      await adapter.incrementOne({
        model: 'room',
        where: [{ field: 'id', value: roomId }],
        increment: { memberCount: 2 }
      })

      const open = await auth.api.recountRoomCapacity({
        body: { roomId },
        asResponse: true
      })

      expect(open.status).toBe(409)
      expect(await codeOf(open)).toBe('ROOM_NOT_LOCKED')

      await auth.api.lockRoom({ body: { roomId } })

      expect(await auth.api.recountRoomCapacity({ body: { roomId } })).toEqual({
        before: 3,
        after: 1
      })
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)

      await auth.api.unlockRoom({ body: { roomId } })

      expect((await join(auth, created.code)).status).toBe(200)
    })
  })
}
