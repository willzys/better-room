import { describe, expect, test } from 'bun:test'

import { join, rows } from './harness'

import type { Harness } from './harness'

export const retirementContract = ({ start }: Harness) => {
  describe('retiring the codes that can no longer admit', () => {
    test('removes revoked and lapsed codes and keeps the ones that admit', async () => {
      const auth = await start({ code: { grace: 1 } })
      const created = await auth.api.createRoom({ body: {} })
      const roomId = created.room.id

      await auth.api.rotateRoomCode({ body: { roomId } })
      const rotated = await auth.api.rotateRoomCode({ body: { roomId } })
      const { adapter } = await auth.$context
      await adapter.updateMany({
        model: 'roomCode',
        where: [{ field: 'status', value: 'grace' }],
        update: { expiresAt: new Date(Date.now() - 1000) }
      })

      expect(await auth.api.retireRoomCodes()).toEqual({
        retired: 2,
        complete: true
      })

      const kept = await rows(auth, 'roomCode')

      expect(kept.map(row => row.status)).toEqual(['active'])
      expect((await join(auth, rotated.code)).status).toBe(200)
      expect((await join(auth, created.code)).status).toBe(400)
    })
  })
}
