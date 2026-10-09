import { describe, expect, test } from 'bun:test'

import { joinStore } from '@/plugin/stores/admission/join'
import { seatingStore } from '@/plugin/stores/admission/seating'
import { releaseStore } from '@/plugin/stores/capacity/release'

import { EARLIER, LATER, NOW } from '../../../helpers/fixtures'
import { onlyRow } from '../../../helpers/http'
import { empty } from '../../../helpers/memory'
import { adapterFor, occupied, seated, seatOf } from '../../../helpers/stores'

describe('enrolling a new member', () => {
  test('writes a vacant membership and leaves the counter to the seat', async () => {
    const db = empty()
    seated(db, 0)

    const vacant = await seatingStore(adapterFor(db)).enroll({
      roomId: 'room-1',
      actorId: 'actor-1',
      role: 'participant',
      expiresAt: null
    })

    expect(vacant.leftAt).not.toBeNull()
    expect(onlyRow(db.roomMember).occupancy).toBe(0)
    expect(onlyRow(db.room).memberCount).toBe(0)
  })

  test('takes the seat of a vacant membership with the terms it names', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(occupied({ occupancy: 0, leftAt: EARLIER }))

    const outcome = seatOf(
      await seatingStore(adapterFor(db)).occupy('member-1', {
        role: 'host',
        expiresAt: LATER
      })
    )

    expect(outcome.occupied).toBe(true)
    expect(outcome.membership).toMatchObject({
      role: 'host',
      expiresAt: LATER,
      leftAt: null
    })
    expect(onlyRow(db.roomMember).occupancy).toBe(1)
  })

  test('never takes the seat of a membership that already left once', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(
      occupied({ occupancy: 0, leftAt: EARLIER, releasedAt: EARLIER })
    )

    const outcome = seatOf(
      await seatingStore(adapterFor(db)).occupy('member-1', {
        role: 'host',
        expiresAt: null
      })
    )

    expect(outcome.occupied).toBe(false)
    expect(onlyRow(db.roomMember).role).toBe('participant')
  })

  test('never seats a revoked membership, vacant or rejoining', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(
      occupied({ occupancy: 0, leftAt: EARLIER, revokedAt: EARLIER })
    )
    const store = seatingStore(adapterFor(db))
    const terms = { role: 'participant', expiresAt: null }

    expect(seatOf(await store.occupy('member-1', terms)).occupied).toBe(false)
    expect(seatOf(await store.reinstate('member-1')).occupied).toBe(false)
    expect(onlyRow(db.roomMember).occupancy).toBe(0)
  })
})

describe('passing the capacity gate', () => {
  test.each([
    ['active', ['active'], true],
    ['locked', ['active'], false],
    ['locked', ['active', 'locked'], true],
    ['closed', ['active', 'locked'], false]
  ] as const)(
    'admits a %s room to statuses %p: %p',
    async (status, open, admitted) => {
      const db = empty()
      seated(db, 0)
      db.room[0] = { ...onlyRow(db.room), status }

      expect(await seatingStore(adapterFor(db)).admit('room-1', 4, open)).toBe(
        admitted
      )
      expect(onlyRow(db.room).memberCount).toBe(admitted ? 1 : 0)
    }
  )
})

describe('taking a seat back on a rejoin', () => {
  test('re-occupies a membership whose seat was returned', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(
      occupied({ occupancy: 0, leftAt: EARLIER, releasedAt: EARLIER })
    )

    const outcome = seatOf(
      await joinStore(adapterFor(db)).reinstate('member-1')
    )

    expect(outcome.occupied).toBe(true)
    expect(outcome.membership.leftAt).toBeNull()
    expect(onlyRow(db.roomMember).occupancy).toBe(1)
    expect(onlyRow(db.roomMember).releasedAt).toBeNull()
  })

  test('never clears a withdrawal without taking the seat', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(occupied({ leftAt: EARLIER }))

    const outcome = seatOf(
      await joinStore(adapterFor(db)).reinstate('member-1')
    )

    expect(outcome.occupied).toBe(false)
    expect(onlyRow(db.roomMember).leftAt).toEqual(EARLIER)
    expect(onlyRow(db.roomMember).occupancy).toBe(1)
  })

  test('never marks a withdrawal it did not take the seat for', async () => {
    const db = empty()
    seated(db, 0)
    db.roomMember.push(occupied({ occupancy: 0, releasedAt: EARLIER }))

    expect(
      await releaseStore(adapterFor(db)).endOccupancy('member-1', NOW, 'left')
    ).toBe(false)

    expect(onlyRow(db.roomMember).leftAt).toBeNull()
  })

  test('returns the seat and the withdrawal in one write', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(occupied())

    expect(
      await releaseStore(adapterFor(db)).endOccupancy('member-1', NOW, 'left')
    ).toBe(true)

    expect(onlyRow(db.roomMember).occupancy).toBe(0)
    expect(onlyRow(db.roomMember).leftAt).toEqual(NOW)
    expect(onlyRow(db.roomMember).releasedAt).toEqual(NOW)
  })
})

describe('two rejoins at once', () => {
  test('lets only one of them take the seat', async () => {
    const db = empty()
    seated(db, 2)
    db.roomMember.push(
      occupied({ occupancy: 0, leftAt: EARLIER, releasedAt: EARLIER })
    )
    const store = joinStore(adapterFor(db))

    const outcomes = (
      await Promise.all([
        store.reinstate('member-1'),
        store.reinstate('member-1')
      ])
    ).map(seatOf)

    expect(outcomes.filter(outcome => outcome.occupied)).toHaveLength(1)
    expect(onlyRow(db.roomMember).occupancy).toBe(1)
    for (const outcome of outcomes) {
      expect(outcome.membership.leftAt).toBeNull()
    }
  })
})

describe('a rejoin whose membership vanished', () => {
  test('answers absent instead of a seat', async () => {
    expect(await joinStore(adapterFor()).reinstate('missing')).toBeNull()
  })
})
