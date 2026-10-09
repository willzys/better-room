import { describe, expect, test } from 'bun:test'

import { eraseActor } from '@/core/operations/identity/erasure'

import { membership, NOW } from '../../../../helpers/fixtures'

import type { Membership } from '@/core/membership'
import type { ErasureStore } from '@/core/operations/identity/erasure'

const store = (seed: { pages: Membership[][]; refusals?: number }) => {
  const order: string[] = []
  const pages = [...seed.pages]
  const state = { refusals: seed.refusals ?? 0, held: false }

  const instance: ErasureStore = {
    heldBy: (_actorId, limit) => {
      order.push(limit === 1 ? 'check' : 'read')

      if (limit === 1) return Promise.resolve(state.held ? [membership()] : [])

      return Promise.resolve(pages.shift() ?? [])
    },
    disown: () => {
      order.push('disown')

      return Promise.resolve()
    },
    forget: () => {
      order.push('forget')

      if (state.refusals === 0) return Promise.resolve()

      state.refusals--
      state.held = true
      pages.unshift([membership({ id: 'late' })])

      return Promise.reject(new Error('a membership still references it'))
    },
    discard: () => {
      state.held = false

      return Promise.resolve()
    },
    endOccupancy: () => Promise.resolve(true),
    lowerCount: () => Promise.resolve()
  }

  return { instance, order }
}

const erasing = (seed: Parameters<typeof store>[0]) => {
  const { instance, order } = store(seed)

  return eraseActor({ actorId: 'actor-1', now: NOW }, instance).then(
    () => order
  )
}

describe('erasing an actor', () => {
  test('drains, disowns, forgets and reads once more for what arrived meanwhile', async () => {
    expect(await erasing({ pages: [[membership()]] })).toEqual([
      'read',
      'read',
      'disown',
      'forget',
      'read',
      'disown'
    ])
  })

  test('drains again and retries when a membership blocked the forget', async () => {
    expect(await erasing({ pages: [], refusals: 1 })).toEqual([
      'read',
      'disown',
      'forget',
      'check',
      'read',
      'read',
      'disown',
      'forget',
      'read',
      'disown'
    ])
  })

  test('gives up loudly when memberships keep arriving', async () => {
    await expect(erasing({ pages: [], refusals: 10 })).rejects.toThrow(
      'memberships kept arriving'
    )
  })

  test('rethrows a forget failure that no membership explains', async () => {
    const failure = new Error('database unavailable')
    const { instance } = store({ pages: [] })

    await expect(
      eraseActor(
        { actorId: 'actor-1', now: NOW },
        { ...instance, forget: () => Promise.reject(failure) }
      )
    ).rejects.toBe(failure)
  })
})
