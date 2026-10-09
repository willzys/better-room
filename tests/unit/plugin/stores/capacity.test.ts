import { describe, expect, test } from 'bun:test'

import { joinStore } from '@/plugin/stores/admission/join'
import { reconciliationStore } from '@/plugin/stores/capacity/reconciliation'
import { releaseStore } from '@/plugin/stores/capacity/release'

import { EARLIER, NOW } from '../../../helpers/fixtures'
import { onlyRow } from '../../../helpers/http'
import { empty } from '../../../helpers/memory'
import { adapterFor, occupied, seated, seatOf } from '../../../helpers/stores'

const invariant = (row: Record<string, unknown>) =>
  row.leftAt === null ? row.occupancy === 1 : row.occupancy === 0

describe('returning the capacity a membership occupied', () => {
  test('claims the occupancy once and lowers the count once', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(occupied())
    const store = releaseStore(adapterFor(db))

    expect(await store.endOccupancy('member-1', NOW, 'none')).toBe(true)
    await store.lowerCount('room-1')

    expect(onlyRow(db.roomMember).occupancy).toBe(0)
    expect(onlyRow(db.roomMember).releasedAt).toEqual(NOW)
    expect(onlyRow(db.room).memberCount).toBe(0)
  })

  test('refuses a second claim on the same membership', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(occupied())
    const store = releaseStore(adapterFor(db))

    expect(await store.endOccupancy('member-1', NOW, 'none')).toBe(true)
    expect(await store.endOccupancy('member-1', NOW, 'none')).toBe(false)
    expect(onlyRow(db.roomMember).occupancy).toBe(0)
  })

  test('refuses a claim on a membership already released', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(occupied({ occupancy: 0, releasedAt: EARLIER }))

    expect(
      await releaseStore(adapterFor(db)).endOccupancy('member-1', NOW, 'none')
    ).toBe(false)
  })

  test('lets only one of many simultaneous claims through', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(occupied())
    const store = releaseStore(adapterFor(db))

    const claims = await Promise.all(
      Array.from({ length: 8 }, () =>
        store.endOccupancy('member-1', NOW, 'none')
      )
    )

    expect(claims.filter(Boolean)).toHaveLength(1)
    expect(onlyRow(db.roomMember).occupancy).toBe(0)
  })

  test('never lowers the count below zero', async () => {
    const db = empty()
    seated(db, 0)
    const store = releaseStore(adapterFor(db))

    await store.lowerCount('room-1')

    expect(onlyRow(db.room).memberCount).toBe(0)
  })
})

describe('a departure interleaved with a rejoin', () => {
  test('holds the invariant when the departure writes first', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(occupied())
    const adapter = adapterFor(db)

    expect(
      await releaseStore(adapter).endOccupancy('member-1', NOW, 'left')
    ).toBe(true)
    const rejoined = seatOf(await joinStore(adapter).reinstate('member-1'))

    expect(rejoined.occupied).toBe(true)
    expect(invariant(onlyRow(db.roomMember))).toBe(true)
    expect(onlyRow(db.roomMember).leftAt).toBeNull()
  })

  test('holds the invariant when the rejoin writes first', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(occupied())
    const adapter = adapterFor(db)

    const rejoined = seatOf(await joinStore(adapter).reinstate('member-1'))
    expect(rejoined.occupied).toBe(false)

    expect(
      await releaseStore(adapter).endOccupancy('member-1', NOW, 'left')
    ).toBe(true)

    expect(invariant(onlyRow(db.roomMember))).toBe(true)
    expect(onlyRow(db.roomMember).leftAt).toEqual(NOW)
  })

  test('never leaves the occupancy outside nought or one', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(occupied())
    const adapter = adapterFor(db)

    await Promise.all([
      releaseStore(adapter).endOccupancy('member-1', NOW, 'left'),
      joinStore(adapter).reinstate('member-1'),
      releaseStore(adapter).endOccupancy('member-1', NOW, 'left'),
      joinStore(adapter).reinstate('member-1')
    ])

    const row = onlyRow(db.roomMember)
    expect([0, 1]).toContain(Number(row.occupancy))
    expect(invariant(row)).toBe(true)
  })
})

const owingOfEveryKind = () => {
  const db = empty()
  db.roomMember.push(
    occupied({ id: 'expired', actorId: 'actor-1', expiresAt: EARLIER }),
    occupied({ id: 'left', actorId: 'actor-2', leftAt: EARLIER }),
    occupied({ id: 'revoked', actorId: 'actor-3', revokedAt: EARLIER })
  )

  return reconciliationStore(adapterFor(db))
}

describe('reading the seats reconciliation owes', () => {
  test('gathers every kind of seat still owed', async () => {
    const owing = await owingOfEveryKind().owing(NOW, 10)

    expect(new Set(owing.map(membership => membership.id))).toEqual(
      new Set(['expired', 'left', 'revoked'])
    )
  })

  test('never hands back more than one batch across the kinds', async () => {
    expect(await owingOfEveryKind().owing(NOW, 2)).toHaveLength(2)
  })
})
