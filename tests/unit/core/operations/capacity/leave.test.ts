import { describe, expect, test } from 'bun:test'

import { leave } from '@/core/operations/capacity/leave'

import {
  actor as actorFixture,
  EARLIER,
  LATER,
  membership,
  NOW,
  room
} from '../../../../helpers/fixtures'

import type { Membership } from '@/core/membership'
import type { LeaveStore } from '@/core/operations/capacity/leave'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

const actor = actorFixture()

const store = (seed: {
  room?: Usable<Room>
  membership?: Usable<Membership>
  reread?: Usable<Membership>
  claims?: boolean
}) => {
  const order: string[] = []
  let reads = 0

  const instance: LeaveStore = {
    room: () => Promise.resolve(seed.room === undefined ? room() : seed.room),
    membership: () => {
      reads += 1

      if (reads > 1 && seed.reread !== undefined) {
        return Promise.resolve(seed.reread)
      }

      return Promise.resolve(
        seed.membership === undefined ? membership() : seed.membership
      )
    },
    endOccupancy: (_id, _at, withdrawal) => {
      order.push(`claim:${withdrawal}`)

      return Promise.resolve(seed.claims ?? true)
    },
    lowerCount: () => {
      order.push('lower')

      return Promise.resolve()
    }
  }

  return { instance, order }
}

const withdrawal = (
  seed: Parameters<typeof store>[0] = {},
  carrier: Usable<typeof actor> = actor
) => {
  const { instance, order } = store(seed)

  return leave({ roomId: 'room-1', actor: carrier, now: NOW }, instance).then(
    outcome => ({ outcome, order })
  )
}

describe('leave', () => {
  test('returns the capacity in the write that marks the withdrawal', async () => {
    const { outcome, order } = await withdrawal()

    expect(order).toEqual(['claim:left', 'lower'])
    expect(outcome.left && outcome.membership.leftAt).toEqual(NOW)
  })

  test('lowers nothing when the seat was already returned', async () => {
    const { outcome, order } = await withdrawal({
      membership: membership({ leftAt: EARLIER }),
      claims: false
    })

    expect(outcome.left).toBe(true)
    expect(order).toEqual(['claim:left'])
  })
})

describe('leave losing a race for the seat', () => {
  test('refuses when a revocation lands between the read and the claim', async () => {
    const { outcome, order } = await withdrawal({
      claims: false,
      reread: membership({ revokedAt: NOW })
    })

    expect(outcome).toEqual({ left: false, refusal: 'revoked' })
    expect(order).toEqual(['claim:left'])
  })

  test('reports the departure a concurrent leave recorded', async () => {
    const { outcome, order } = await withdrawal({
      claims: false,
      reread: membership({ leftAt: EARLIER })
    })

    expect(outcome.left && outcome.membership.leftAt).toEqual(EARLIER)
    expect(order).toEqual(['claim:left'])
  })

  test('refuses when the membership disappeared before the claim', async () => {
    const { outcome } = await withdrawal({ claims: false, reread: null })

    expect(outcome).toEqual({ left: false, refusal: 'not-a-member' })
  })
})

describe('leave refusing', () => {
  test('refuses a room that does not exist', async () => {
    const { outcome, order } = await withdrawal({ room: null })

    expect(outcome).toEqual({ left: false, refusal: 'unknown-room' })
    expect(order).toEqual([])
  })

  test('refuses a caller carrying no actor', async () => {
    const { outcome, order } = await withdrawal({}, null)

    expect(outcome).toEqual({ left: false, refusal: 'not-a-member' })
    expect(order).toEqual([])
  })

  test('refuses a caller holding no membership', async () => {
    const { outcome, order } = await withdrawal({ membership: null })

    expect(outcome).toEqual({ left: false, refusal: 'not-a-member' })
    expect(order).toEqual([])
  })

  test.each([
    ['a revoked membership', { revokedAt: EARLIER }, 'revoked'],
    ['an expired membership', { expiresAt: EARLIER }, 'membership-expired']
  ] as const)(
    'refuses %s rather than overriding it',
    async (_label, overrides, refusal) => {
      const { outcome, order } = await withdrawal({
        membership: membership(overrides)
      })

      expect(outcome).toEqual({ left: false, refusal })
      expect(order).toEqual([])
    }
  )

  test('leaves a room that has ended, since it overrides nothing', async () => {
    const { outcome, order } = await withdrawal({
      room: room({ status: 'closed' }),
      membership: membership({ expiresAt: LATER })
    })

    expect(outcome.left).toBe(true)
    expect(order).toEqual(['claim:left', 'lower'])
  })
})
