import { describe, expect, test } from 'bun:test'

import { chargeFailure, isThrottled } from '@/core/operations/admission/attempt'

import { NOW } from '../../../../helpers/fixtures'

import type { Attempt, AttemptStore } from '@/core/attempt'
import type { AttemptBudgets } from '@/core/operations/admission/attempt'
import type { Usable } from '@/types/absence'

const BUDGETS: AttemptBudgets = {
  perIp: { max: 1, window: 60 },
  everyone: { max: 1, window: 60 }
}

const IP = '203.0.113.7'

const store = (held: Record<string, number> = {}) => {
  const read: string[] = []
  const opened: string[] = []

  const instance: AttemptStore = {
    read: key => {
      read.push(key)
      const count = held[key]
      const attempt: Usable<Attempt> =
        count === undefined ? null : { key, count, lastAttemptAt: NOW }

      return Promise.resolve(attempt)
    },
    open: key => {
      opened.push(key)

      return Promise.resolve(true)
    },
    restart: () => Promise.resolve(true),
    bump: () => Promise.resolve(true),
    prune: () => Promise.resolve()
  }

  return { instance, read, opened }
}

describe('chargeFailure', () => {
  test('charges the global budget and the address that failed', async () => {
    const { instance, opened } = store()

    await chargeFailure({ ip: IP, budgets: BUDGETS, now: NOW }, instance)

    expect(new Set(opened)).toEqual(new Set(['global', `ip:${IP}`]))
  })

  test('charges only the global budget when no address is known', async () => {
    const { instance, opened } = store()

    await chargeFailure({ ip: null, budgets: BUDGETS, now: NOW }, instance)

    expect(opened).toEqual(['global'])
  })
})

describe('isThrottled', () => {
  test('throttles an address that spent its own budget', async () => {
    const { instance, read } = store({ [`ip:${IP}`]: 1 })

    expect(
      await isThrottled({ ip: IP, budgets: BUDGETS, now: NOW }, instance)
    ).toBe(true)
    expect(new Set(read)).toEqual(new Set(['global', `ip:${IP}`]))
  })

  test('judges a caller without an address by the global budget alone', async () => {
    const { instance, read } = store({ global: 1 })

    expect(
      await isThrottled({ ip: null, budgets: BUDGETS, now: NOW }, instance)
    ).toBe(true)
    expect(read).toEqual(['global'])
  })
})
