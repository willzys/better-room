import { describe, expect, test } from 'bun:test'

import { codeOf } from '../../helpers/http'
import { rows, join } from './harness'

import type { Harness } from './harness'

export const rotationContract = ({ start }: Harness) => {
  describe('rotation', () => {
    test('admits the active and grace codes, then revokes the oldest code on the next rotation', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const rotated = await auth.api.rotateRoomCode({
        body: { roomId: created.room.id }
      })
      expect(rotated.code).not.toBe(created.code)
      const codes = await rows(auth, 'roomCode')
      expect(codes).toHaveLength(2)
      expect(new Set(codes.map(row => row.status))).toEqual(
        new Set(['active', 'grace'])
      )
      expect((await join(auth, created.code)).status).toBe(200)
      expect((await join(auth, rotated.code)).status).toBe(200)
      await auth.api.rotateRoomCode({ body: { roomId: created.room.id } })
      const rotatedCodes = await rows(auth, 'roomCode')
      expect(rotatedCodes).toHaveLength(3)
      expect(new Set(rotatedCodes.map(row => row.status))).toEqual(
        new Set(['active', 'grace', 'revoked'])
      )
      const refused = await join(auth, created.code)
      expect(refused.status).toBe(400)
      expect(await codeOf(refused)).toBe('CODE_DID_NOT_RESOLVE')
      expect((await join(auth, rotated.code)).status).toBe(200)
    })
    test('refuses an expired grace code without writing an actor', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      await auth.api.rotateRoomCode({ body: { roomId: created.room.id } })
      const { adapter } = await auth.$context
      await adapter.updateMany({
        model: 'roomCode',
        where: [{ field: 'status', value: 'grace' }],
        update: { expiresAt: new Date(0) }
      })
      const refused = await join(auth, created.code)
      expect(refused.status).toBe(400)
      expect(await codeOf(refused)).toBe('CODE_DID_NOT_RESOLVE')
      expect(await rows(auth, 'roomActor')).toHaveLength(0)
    })
  })
}
