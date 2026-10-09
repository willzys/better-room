import { describe, expect, test } from 'bun:test'

import { codeOf, jarOf, onlyRow } from '../../helpers/http'
import { rows, join, departing } from './harness'

import type { Harness } from './harness'

export const lifecycleContract = ({ start }: Harness) => {
  describe('the room lifecycle', () => {
    test('locking keeps the members it already has and refuses new ones', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      const cookie = jarOf(await join(auth, created.code))
      const locked = await auth.api.lockRoom({
        body: { roomId: created.room.id }
      })
      expect(locked.room.status).toBe('locked')

      const refused = await join(auth, created.code)
      expect(refused.status).toBe(403)
      expect(await codeOf(refused)).toBe('ROOM_LOCKED')

      const access = await auth.api.getRoomAccess({
        query: { roomId: created.room.id },
        headers: new Headers({ cookie }),
        asResponse: true
      })
      expect((await access.json()).authorized).toBe(true)

      const unlocked = await auth.api.unlockRoom({
        body: { roomId: created.room.id }
      })
      expect(unlocked.room.status).toBe('active')
      expect((await join(auth, created.code)).status).toBe(200)
    })
    test('closing ends the room and refuses to reopen it', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      const cookie = jarOf(await join(auth, created.code))
      await auth.api.closeRoom({ body: { roomId: created.room.id } })

      expect(onlyRow(await rows(auth, 'room')).status).toBe('closed')
      expect(await codeOf(await join(auth, created.code))).toBe('ROOM_CLOSED')

      const reopened = await auth.api.unlockRoom({
        body: { roomId: created.room.id },
        asResponse: true
      })
      expect(reopened.status).toBe(403)
      expect(await codeOf(reopened)).toBe('ROOM_CLOSED')

      const left = await departing(auth, created.room.id, cookie)
      expect(left.status).toBe(200)
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(0)
    })
  })
}
