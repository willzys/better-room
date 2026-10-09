import { describe, expect, test } from 'bun:test'

import { isBlocked, isExhausted, recordAttempt } from '@/core/attempt'

import { NOW } from '../../helpers/fixtures'

import type { Attempt, AttemptStore } from '@/core/attempt'
import type { Usable } from '@/types/absence'

const LIMIT = { max: 3, window: 60 }

const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000)

const attempt = (overrides: Partial<Attempt> = {}): Attempt => ({
  key: 'ip:1.2.3.4',
  count: 1,
  lastAttemptAt: ago(1),
  ...overrides
})

type Calls = {
  open: number
  restart: number
  bump: number
  prune: Date[]
}

const store = (seed: {
  rows?: Usable<Attempt>[]
  open?: boolean
  restart?: boolean
  bump?: boolean
}) => {
  const calls: Calls = { open: 0, restart: 0, bump: 0, prune: [] }
  const rows = [...(seed.rows ?? [null])]

  const instance: AttemptStore = {
    read: () =>
      Promise.resolve(
        rows.length > 1 ? (rows.shift() ?? null) : (rows[0] ?? null)
      ),
    open: () => {
      calls.open++

      return Promise.resolve(seed.open ?? true)
    },
    restart: () => {
      calls.restart++

      return Promise.resolve(seed.restart ?? true)
    },
    bump: () => {
      calls.bump++

      return Promise.resolve(seed.bump ?? true)
    },
    prune: before => {
      calls.prune.push(before)

      return Promise.resolve()
    }
  }

  return { instance, calls }
}

const record = (seed: Parameters<typeof store>[0]) => {
  const { instance, calls } = store(seed)

  return recordAttempt(
    { key: 'ip:1.2.3.4', limit: LIMIT, now: NOW },
    instance
  ).then(() => calls)
}

const counted = (seed: Parameters<typeof store>[0]) =>
  recordAttempt(
    { key: 'ip:1.2.3.4', limit: LIMIT, now: NOW },
    store(seed).instance
  )

describe('isExhausted', () => {
  test('is not exhausted when nothing was ever counted', () => {
    expect(isExhausted(null, LIMIT, NOW)).toBe(false)
  })

  test('is exhausted only once the count reaches the ceiling', () => {
    expect(isExhausted(attempt({ count: 2 }), LIMIT, NOW)).toBe(false)
    expect(isExhausted(attempt({ count: 3 }), LIMIT, NOW)).toBe(true)
    expect(isExhausted(attempt({ count: 9 }), LIMIT, NOW)).toBe(true)
  })

  test('forgives a count whose window has elapsed', () => {
    const elapsed = attempt({ count: 9, lastAttemptAt: ago(60) })
    const active = attempt({ count: 9, lastAttemptAt: ago(59) })
    expect(isExhausted(elapsed, LIMIT, NOW)).toBe(false)
    expect(isExhausted(active, LIMIT, NOW)).toBe(true)
  })

  test('keeps a sustained run exhausted, since each attempt refreshes the stamp', () => {
    expect(
      isExhausted(attempt({ count: 50, lastAttemptAt: NOW }), LIMIT, NOW)
    ).toBe(true)
  })
})

describe('recordAttempt', () => {
  test('opens the row the first time a key is seen', async () => {
    const calls = await record({ rows: [null] })

    expect(calls.open).toBe(1)
    expect(calls.bump).toBe(0)
    expect(calls.restart).toBe(0)
  })

  test('bumps an existing row inside its window', async () => {
    const calls = await record({ rows: [attempt()] })

    expect(calls.bump).toBe(1)
    expect(calls.open).toBe(0)
    expect(calls.restart).toBe(0)
  })

  test('restarts an elapsed window and prunes behind it', async () => {
    const calls = await record({ rows: [attempt({ lastAttemptAt: ago(120) })] })

    expect(calls.restart).toBe(1)
    expect(calls.bump).toBe(0)
    expect(calls.prune).toEqual([new Date(NOW.getTime() - 60_000)])
  })

  test('retries when another request opened the row first', async () => {
    const calls = await record({ rows: [null, attempt()], open: false })

    expect(calls.open).toBe(1)
    expect(calls.bump).toBe(1)
  })

  test('retries when another request restarted the window first', async () => {
    const calls = await record({
      rows: [attempt({ lastAttemptAt: ago(120) }), attempt()],
      restart: false
    })

    expect(calls.restart).toBe(1)
    expect(calls.bump).toBe(1)
  })

  test('gives up after bounded retries instead of looping', async () => {
    const calls = await record({ rows: [null], open: false })

    expect(calls.open).toBe(3)
  })

  test('counts past the ceiling so a sustained run never rolls its window', async () => {
    const calls = await record({ rows: [attempt({ count: 99 })] })

    expect(calls.bump).toBe(1)
  })
})

describe('recordAttempt losing a write', () => {
  test('retries a bump whose window rolled over mid-request', async () => {
    const calls = await record({ rows: [attempt()], bump: false })

    expect(calls.bump).toBe(3)
  })

  test('reports the attempt it could not count', async () => {
    expect(await counted({ rows: [attempt()], bump: false })).toBe(false)
  })

  test('reports an attempt it could not open', async () => {
    expect(await counted({ rows: [null], open: false })).toBe(false)
  })

  test('reports an attempt it could not restart', async () => {
    const stale = attempt({ lastAttemptAt: ago(120) })

    expect(await counted({ rows: [stale], restart: false })).toBe(false)
  })

  test.each([
    ['opened', { rows: [null] }],
    ['bumped', { rows: [attempt()] }],
    ['restarted', { rows: [attempt({ lastAttemptAt: ago(120) })] }]
  ])('reports the attempt it %s', async (_label, seed) => {
    expect(await counted(seed)).toBe(true)
  })
})

describe('isBlocked', () => {
  const LIMITS = {
    perIp: { max: 3, window: 60 },
    everyone: { max: 10, window: 60 }
  }

  test('blocks an address that spent its own ceiling', () => {
    expect(
      isBlocked({ mine: attempt({ count: 3 }), everyone: null }, LIMITS, NOW)
    ).toBe(true)
  })

  test('lets an address through while it has budget of its own', () => {
    expect(
      isBlocked(
        { mine: attempt({ count: 2 }), everyone: attempt({ count: 1 }) },
        LIMITS,
        NOW
      )
    ).toBe(false)
  })

  test('spares an address that never failed when the global ceiling is spent', () => {
    expect(
      isBlocked({ mine: null, everyone: attempt({ count: 10 }) }, LIMITS, NOW)
    ).toBe(false)
  })

  test('holds an address with a failure of its own to the global ceiling', () => {
    expect(
      isBlocked(
        { mine: attempt({ count: 1 }), everyone: attempt({ count: 10 }) },
        LIMITS,
        NOW
      )
    ).toBe(true)
  })

  test('forgives an address whose own record has gone stale', () => {
    const stale = attempt({ count: 1, lastAttemptAt: ago(120) })
    expect(
      isBlocked(
        {
          mine: stale,
          everyone: attempt({ count: 10 })
        },
        LIMITS,
        NOW
      )
    ).toBe(false)
  })
})
