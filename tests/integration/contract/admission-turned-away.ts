import { describe, expect, test } from 'bun:test'

import { codeOf, jarOf, joinedMember, onlyRow } from '../../helpers/http'
import { join, rows } from './harness'

import type { Harness } from './harness'

export const turnedAwayContract = ({ start }: Harness) => {
  describe('a join the room turns away', () => {
    test('leaves no actor behind for a caller refused by a full room', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: { maxMembers: 1 } })

      await joinedMember(await join(auth, created.code))

      const refused = await Promise.all(
        Array.from({ length: 5 }, () => join(auth, created.code))
      )

      expect(await Promise.all(refused.map(codeOf))).toEqual(
        Array.from({ length: 5 }, () => 'ROOM_AT_CAPACITY')
      )
      expect(await rows(auth, 'roomActor')).toHaveLength(1)
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)
    })

    test('answers a member who joins a locked room again with its membership', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const first = await join(auth, created.code)
      const cookie = jarOf(first)
      const held = await joinedMember(first)

      await auth.api.lockRoom({ body: { roomId: created.room.id } })

      const again = await joinedMember(await join(auth, created.code, cookie))
      const stranger = await join(auth, created.code)

      expect(again.id).toBe(held.id)
      expect(stranger.status).toBe(403)
      expect(await codeOf(stranger)).toBe('ROOM_LOCKED')
      expect(await rows(auth, 'roomActor')).toHaveLength(1)
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)
    })
  })
}
