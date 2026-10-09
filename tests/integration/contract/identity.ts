import { describe, expect, test } from 'bun:test'

import { signedIn } from '../../helpers/auth'
import {
  codeOf,
  jarOf,
  joinedMember,
  onlyRow,
  stringField
} from '../../helpers/http'
import { rows, join, promoting } from './harness'

import type { Harness } from './harness'

export const promotionContract = ({ start }: Harness) => {
  describe('promoting an anonymous actor', () => {
    test('carries the membership across and spends no second seat', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: { maxMembers: 1 } })
      const joined = await join(auth, created.code)
      const grant = jarOf(joined)
      const member = await joinedMember(joined)
      const session = await signedIn(auth, 'carried@example.com')

      const promoted = await promoting(auth, `${session}; ${grant}`)
      expect(promoted.status).toBe(200)
      const reported = await promoted.json()
      expect(reported.carried).toBe(1)
      expect(reported.discarded).toBe(0)
      expect(reported.actorId).not.toBe(member.actorId)

      const stored = onlyRow(await rows(auth, 'roomMember'))
      expect(stored.id).toBe(member.id)
      expect(stored.actorId).toBe(reported.actorId)
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)

      const access = await auth.api.getRoomAccess({
        query: { roomId: created.room.id },
        headers: new Headers({ cookie: session }),
        asResponse: true
      })
      expect((await access.json()).authorized).toBe(true)
    })
    test('forgets the anonymous actor and the grant that named it', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      const joined = await join(auth, created.code)
      const grant = jarOf(joined)
      const member = await joinedMember(joined)
      const session = await signedIn(auth, 'forgotten@example.com')

      expect((await promoting(auth, `${session}; ${grant}`)).status).toBe(200)

      const actors = await rows(auth, 'roomActor')
      expect(actors.find(row => row.id === member.actorId)).toBeUndefined()

      const stale = await auth.api.getRoomAccess({
        query: { roomId: created.room.id },
        headers: new Headers({ cookie: grant }),
        asResponse: true
      })
      expect((await stale.json()).authorized).toBe(false)
    })
    test('discards the anonymous membership when both hold one', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      const session = await signedIn(auth, 'collided@example.com')
      await join(auth, created.code, session)
      const grant = jarOf(await join(auth, created.code))
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(2)

      const promoted = await promoting(auth, `${session}; ${grant}`)
      expect(promoted.status).toBe(200)
      const reported = await promoted.json()
      expect(reported.carried).toBe(0)
      expect(reported.discarded).toBe(1)

      expect(await rows(auth, 'roomMember')).toHaveLength(1)
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)
    })
  })
}

export const promotionRefusalContract = ({ start }: Harness) => {
  describe('promotion refused', () => {
    test('refuses a caller carrying no session', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      const grant = jarOf(await join(auth, created.code))

      const refused = await promoting(auth, grant)
      expect(refused.status).toBe(401)
      expect(await codeOf(refused)).toBe('PROMOTION_NEEDS_A_SESSION')
    })
    test('refuses a caller carrying no grant', async () => {
      const auth = await start({})
      const session = await signedIn(auth, 'ungranted@example.com')

      const refused = await promoting(auth, session)
      expect(refused.status).toBe(400)
      expect(await codeOf(refused)).toBe('NO_GRANT_TO_PROMOTE')
    })
    test('refuses a second promotion of the same grant', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: {} })
      const grant = jarOf(await join(auth, created.code))
      const session = await signedIn(auth, 'twice@example.com')
      const both = `${session}; ${grant}`

      expect((await promoting(auth, both)).status).toBe(200)

      const refused = await promoting(auth, both)
      expect(refused.status).toBe(404)
      expect(await codeOf(refused)).toBe('UNKNOWN_ACTOR')
    })
  })
}

export const erasureContract = ({ start }: Harness) => {
  describe('erasing the actor a deleted user owned', () => {
    test('returns its seat, forgets the actor and keeps the room', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: { maxMembers: 1 } })
      const cookie = await signedIn(auth, 'erased@example.com')
      const member = await joinedMember(await join(auth, created.code, cookie))

      const linked = onlyRow(await rows(auth, 'roomActor'))

      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)
      expect(stringField(linked, 'id')).toBe(member.actorId)

      const deleted = await auth.api.deleteUser({
        body: {},
        headers: new Headers({ cookie }),
        asResponse: true
      })

      expect(deleted.status).toBe(200)
      expect(await rows(auth, 'roomMember')).toHaveLength(0)
      expect(await rows(auth, 'roomActor')).toHaveLength(0)
      expect(onlyRow(await rows(auth, 'room')).id).toBe(created.room.id)
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(0)
    })
  })
}
