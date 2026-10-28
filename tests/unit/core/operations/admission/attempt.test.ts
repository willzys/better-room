import { describe, expect, test } from 'bun:test'

import {
  chargeFailure,
  isThrottled,
  releaseAttempt,
  reserveAttempt
} from '@/core/operations/admission/attempt'

import { NOW } from '../../../../helpers/fixtures'

import type { Attempt, AttemptStore } from '@/core/attempt'
import type { AttemptBudgets } from '@/core/operations/admission/attempt'
import type { Usable } from '@/types/absence'

const BUDGETS: AttemptBudgets = {
  perIp: { max: 1, window: 60 },
  everyone: { max: 1, window: 60 },
  progressive: false,
  reserve: false
}

const IP = '203.0.113.7'

const store = (held: Record<string, number> = {}) => {
  const read: string[] = []
  const opened: string[] = []
  const refunded: string[] = []

  const instance: AttemptStore = {
    read: key => {
      read.push(key)
      const count = held[key]
      const attempt: Usable<Attempt> =
        count === undefined ? null : { key, count, startedAt: NOW }

      return Promise.resolve(attempt)
    },
    open: key => {
      opened.push(key)

      return Promise.resolve(true)
    },
    restart: () => Promise.resolve(true),
    bump: () => Promise.resolve(true),
    prune: () => Promise.resolve(),
    refund: key => {
      refunded.push(key)

      return Promise.resolve(true)
    }
  }

  return { instance, read, opened, refunded }
}

describe('chargeFailure', () => {
  test('charges the global budget and the address that failed', async () => {
    const { instance, opened } = store()

    await chargeFailure({ address: IP, budgets: BUDGETS, now: NOW }, instance)

    expect(new Set(opened)).toEqual(new Set(['global', `address:${IP}`]))
  })

  test('charges only the global budget when no address is known', async () => {
    const { instance, opened } = store()

    await chargeFailure({ address: null, budgets: BUDGETS, now: NOW }, instance)

    expect(opened).toEqual(['global'])
  })
})

describe('isThrottled', () => {
  test('throttles an address that spent its own budget', async () => {
    const { instance, read } = store({ [`address:${IP}`]: 1 })

    expect(
      await isThrottled({ address: IP, budgets: BUDGETS, now: NOW }, instance)
    ).toBe(true)
    expect(new Set(read)).toEqual(new Set(['global', `address:${IP}`]))
  })

  test('paces an address under its ceiling only when asked to', async () => {
    const roomy = { max: 10, window: 60 }
    const budgets = { perIp: roomy, everyone: roomy }
    const { instance } = store({ [`address:${IP}`]: 3 })
    const request = (progressive: boolean) => ({
      address: IP,
      budgets: { ...budgets, progressive, reserve: false },
      now: NOW
    })

    expect(await isThrottled(request(true), instance)).toBe(true)
    expect(await isThrottled(request(false), instance)).toBe(false)
  })

  test('judges a caller without an address by the global budget alone', async () => {
    const { instance, read } = store({ global: 1 })

    expect(
      await isThrottled({ address: null, budgets: BUDGETS, now: NOW }, instance)
    ).toBe(true)
    expect(read).toEqual(['global'])
  })
})

describe('reserving an attempt before the code resolves', () => {
  const reserving = { ...BUDGETS, perIp: { max: 2, window: 60 }, reserve: true }
  const request = { address: IP, budgets: reserving, now: NOW }

  test('holds a reservation while the address is under its ceiling', async () => {
    const { instance, opened } = store()

    expect(await reserveAttempt(request, instance)).toBe('held')
    expect(opened).toEqual([`address:${IP}`])
  })

  test('refuses once the reservations pass the ceiling', async () => {
    const { instance } = store({ [`address:${IP}`]: 3 })

    expect(await reserveAttempt(request, instance)).toBe('over')
  })

  test('reserves nothing unless asked to, or without an address', async () => {
    const { instance, opened } = store()

    expect(
      await reserveAttempt({ ...request, budgets: BUDGETS }, instance)
    ).toBe('none')
    expect(await reserveAttempt({ ...request, address: null }, instance)).toBe(
      'none'
    )
    expect(opened).toEqual([])
  })

  test('returns a held reservation and charges only the global budget for a failure', async () => {
    const { instance, refunded, opened } = store()

    expect(await releaseAttempt(request, instance, 'held')).toBe(true)
    await chargeFailure(request, instance, 'held')

    expect(refunded).toEqual([`address:${IP}`])
    expect(opened).toEqual(['global'])
  })
})
