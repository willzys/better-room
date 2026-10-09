import { describe, expect, test } from 'bun:test'

import { occupies } from '@/core/membership'
import { release } from '@/core/operations/capacity/release'

import { EARLIER, LATER, NOW, membership } from '../../../../helpers/fixtures'

import type { ReleaseStore } from '@/core/operations/capacity/release'

const store = (claims: boolean) => {
  const order: string[] = []

  const instance: ReleaseStore = {
    endOccupancy: () => {
      order.push('claim')

      return Promise.resolve(claims)
    },
    lowerCount: () => {
      order.push('lower')

      return Promise.resolve()
    }
  }

  return { instance, order }
}

describe('occupies', () => {
  test('occupies while nothing has ended it', () => {
    expect(occupies(membership(), NOW)).toBe(true)
  })

  test('occupies while its own deadline is still ahead', () => {
    expect(occupies(membership({ expiresAt: LATER }), NOW)).toBe(true)
  })

  test.each([
    ['the actor left', { leftAt: EARLIER }],
    ['it was revoked', { revokedAt: EARLIER }],
    ['its deadline passed', { expiresAt: EARLIER }],
    ['its deadline is exactly now', { expiresAt: NOW }]
  ])('stops occupying once %s', (_label, overrides) => {
    expect(occupies(membership(overrides), NOW)).toBe(false)
  })
})

describe('release', () => {
  test('lowers the count only after it claimed the occupancy', async () => {
    const { instance, order } = store(true)

    expect(await release(membership(), NOW, instance, 'none')).toBe(true)
    expect(order).toEqual(['claim', 'lower'])
  })

  test('lowers nothing when another caller claimed it first', async () => {
    const { instance, order } = store(false)

    expect(await release(membership(), NOW, instance, 'none')).toBe(false)
    expect(order).toEqual(['claim'])
  })
})
