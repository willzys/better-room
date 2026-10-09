import { describe, expect, test } from 'bun:test'

import { codeFormat } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

import { SECRET, signedIn } from '../../helpers/auth'
import { joinedMember, onlyRow, stringField } from '../../helpers/http'
import { rows, join } from './harness'

import type { Harness } from './harness'

export const schemaContract = ({ start, uniqueViolation }: Harness) => {
  describe('schema invariants', () => {
    test('rejects a second code carrying one identifier', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const { adapter } = await auth.$context
      const stored = onlyRow(await rows(auth, 'roomCode'))
      await expect(
        adapter.create({
          model: 'roomCode',
          data: {
            identifier: stored.identifier,
            roomId: created.room.id,
            status: 'active',
            expiresAt: null,
            revokedAt: null,
            createdAt: new Date()
          }
        })
      ).rejects.toMatchObject(uniqueViolation)
      expect(await rows(auth, 'roomCode')).toHaveLength(1)
    })
    test('rejects a second attempt row carrying one key', async () => {
      const auth = await start()
      const { adapter } = await auth.$context
      const budget = {
        key: 'ip:203.0.113.9',
        count: 1,
        lastAttemptAt: new Date()
      }
      await adapter.create({ model: 'roomAttempt', data: budget })
      await expect(
        adapter.create({ model: 'roomAttempt', data: budget })
      ).rejects.toMatchObject(uniqueViolation)
      expect(await rows(auth, 'roomAttempt')).toHaveLength(1)
    })
  })
}

export const uniquenessContract = ({ start, uniqueViolation }: Harness) => {
  describe('the uniqueness every backend owes', () => {
    test('rejects a duplicate membership with a unique constraint violation', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const member = await joinedMember(await join(auth, created.code))
      const { adapter } = await auth.$context
      await expect(
        adapter.create({
          model: 'roomMember',
          data: {
            roomId: created.room.id,
            actorId: member.actorId,
            role: 'host',
            joinedAt: new Date()
          }
        })
      ).rejects.toMatchObject(uniqueViolation)
      expect(await rows(auth, 'roomMember')).toHaveLength(1)
    })
    test('rejects a second actor for one user with a constraint violation', async () => {
      const auth = await start()
      await signedIn(auth, 'oneactor@example.com')
      const { adapter } = await auth.$context
      const userId = stringField(onlyRow(await rows(auth, 'user')), 'id')
      const actor = { userId, grantEpoch: 0, createdAt: new Date() }
      await adapter.create({ model: 'roomActor', data: actor })
      await expect(
        adapter.create({ model: 'roomActor', data: actor })
      ).rejects.toMatchObject(uniqueViolation)
    })
    test('persists the derived identifier without a recoverable code', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const stored = onlyRow(await rows(auth, 'roomCode'))
      expect(stored.identifier).toBe(
        await codeIdentifier({
          format: codeFormat('crockford'),
          secret: SECRET
        })(created.code)
      )
      expect(stored.roomId).toBe(created.room.id)
      expect(JSON.stringify(stored)).not.toContain(created.code)
      expect(await rows(auth, 'roomMember')).toHaveLength(0)
      expect(created.room.memberCount).toBe(0)
    })
  })
}
