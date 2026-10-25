import { describe, expect, test } from 'bun:test'

import { reconcile } from '@/core/operations/capacity/reconciliation'
import { reconciliationStore } from '@/plugin/stores/capacity/reconciliation'

import { jarOf, joinedMember, onlyRow } from '../../helpers/http'
import { adapterOf, departing, join, rows } from './harness'

import type { Auth, Harness } from './harness'

const expiring = async (auth: Auth, membershipId: string, expiresAt: Date) => {
  const { adapter } = await auth.$context
  await adapter.updateMany({
    model: 'roomMember',
    where: [{ field: 'id', value: membershipId }],
    update: { expiresAt }
  })
}

const readmittedAfterTheSweepRead = async (auth: Auth) => {
  const lobby = await auth.api.createRoom({ body: {} })
  const created = await auth.api.createRoom({ body: { maxMembers: 1 } })
  const response = await join(auth, lobby.code)
  const { actorId } = await joinedMember(response)
  const until = new Date(Date.now() + 60_000)
  const added = await auth.api.addRoomMember({
    body: {
      roomId: created.room.id,
      actorId,
      role: 'participant',
      expiresAt: until
    }
  })
  const store = reconciliationStore(await adapterOf(auth))

  await expiring(auth, added.membership.id, new Date(Date.now() - 60_000))
  const owing = await store.owing(new Date(), 10)
  await expiring(auth, added.membership.id, until)

  expect((await departing(auth, created.room.id, jarOf(response))).status).toBe(
    200
  )
  await auth.api.addRoomMember({
    body: { roomId: created.room.id, actorId, role: 'participant' }
  })

  const reconciled = await reconcile(
    { now: new Date(), batch: 10 },
    { ...store, owing: () => Promise.resolve(owing) }
  )

  return {
    reconciled,
    roomId: created.room.id,
    membershipId: added.membership.id
  }
}

export const reconciliationContract = ({ start }: Harness) => {
  describe('reconciling the capacity an expiry dropped', () => {
    test('returns the seat an expired membership never gave back', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: { maxMembers: 1 } })
      const joined = await join(auth, created.code)
      const member = await joinedMember(joined)
      const { adapter } = await auth.$context
      await adapter.updateMany({
        model: 'roomMember',
        where: [{ field: 'id', value: member.id }],
        update: { expiresAt: new Date(Date.now() - 60_000) }
      })

      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)

      const first = await auth.api.reconcileRoomCapacity({ body: {} })
      expect(first).toEqual({ owing: 1, released: 1 })
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(0)
      expect(onlyRow(await rows(auth, 'roomMember')).occupancy).toBe(0)

      const second = await auth.api.reconcileRoomCapacity({ body: {} })
      expect(second).toEqual({ owing: 0, released: 0 })
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(0)
      expect((await join(auth, created.code)).status).toBe(200)
    })

    test('leaves a membership with no deadline in its seat', async () => {
      const auth = await start({})
      const created = await auth.api.createRoom({ body: { maxMembers: 1 } })
      await joinedMember(await join(auth, created.code))

      expect(await auth.api.reconcileRoomCapacity({ body: {} })).toEqual({
        owing: 0,
        released: 0
      })
      expect(onlyRow(await rows(auth, 'room')).memberCount).toBe(1)
      expect(onlyRow(await rows(auth, 'roomMember')).occupancy).toBe(1)
    })

    test('keeps the seat of a membership readmitted after the sweep read it', async () => {
      const auth = await start({})
      const { reconciled, roomId, membershipId } =
        await readmittedAfterTheSweepRead(auth)
      const room = (await rows(auth, 'room')).find(row => row.id === roomId)
      const member = (await rows(auth, 'roomMember')).find(
        row => row.id === membershipId
      )

      expect(reconciled.released).toBe(0)
      expect(Number(member?.occupancy)).toBe(1)
      expect(Number(room?.memberCount)).toBe(1)
    })
  })
}
