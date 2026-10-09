import { describe, expect, test } from 'bun:test'

import { promote } from '@/core/operations/identity/promotion'

import {
  actor as actorFixture,
  membership,
  NOW
} from '../../../../helpers/fixtures'

import type { Membership } from '@/core/membership'
import type { PromotionStore } from '@/core/operations/identity/promotion'

const anonymous = actorFixture({ id: 'anon', userId: null, grantEpoch: 3 })
const owner = actorFixture({ id: 'owner', userId: 'user-1' })

const page = (from: number, count: number): Membership[] =>
  Array.from({ length: count }, (_, index) =>
    membership({
      id: `member-${from + index}`,
      roomId: `room-${from + index}`,
      actorId: 'anon'
    })
  )

const store = (seed: {
  pages: Membership[][]
  collides?: boolean
  invalidates?: boolean
  survives?: boolean
  blocked?: boolean
}) => {
  const order: string[] = []
  const pages = [...seed.pages]
  const moved: string[] = []
  const thrown: string[] = []
  const blocking = { left: seed.blocked === true }

  const instance: PromotionStore = {
    byId: () => Promise.resolve(anonymous),
    owner: () => Promise.resolve(owner),
    invalidate: () => {
      order.push('invalidate')

      return Promise.resolve(seed.invalidates ?? true)
    },
    heldBy: () => {
      order.push('read')

      return Promise.resolve(pages.shift() ?? [])
    },
    membership: () =>
      Promise.resolve(seed.collides === true ? membership() : null),
    reassign: membershipId => {
      moved.push(membershipId)

      return Promise.resolve(true)
    },
    discard: membershipId => {
      thrown.push(membershipId)

      return Promise.resolve()
    },
    endOccupancy: () => Promise.resolve(true),
    lowerCount: () => Promise.resolve(),
    forget: () => {
      order.push('forget')

      if (!blocking.left) return Promise.resolve()

      blocking.left = false
      pages.unshift(page(500, 1))

      return Promise.reject(new Error('a membership still references it'))
    },
    disown: () => Promise.resolve(),
    survives: () => {
      order.push('survives')

      return Promise.resolve(seed.survives ?? true)
    }
  }

  return { instance, order, moved, thrown }
}

const promoting = (seed: Parameters<typeof store>[0]) => {
  const { instance, order, moved, thrown } = store(seed)

  return promote(
    {
      userId: 'user-1',
      actorId: 'anon',
      authority: { kind: 'grant', epoch: 3 },
      now: NOW
    },
    instance
  ).then(outcome => ({ outcome, order, moved, thrown }))
}

describe('promote reading past one page', () => {
  test('carries every membership a bounded read could not return at once', async () => {
    const { outcome } = await promoting({
      pages: [page(1, 200), page(201, 1)]
    })

    expect(outcome.promoted && outcome.carried).toBe(201)
  })

  test('forgets the actor only after a read comes back empty', async () => {
    const { order } = await promoting({ pages: [page(1, 200), page(201, 1)] })

    expect(order).toEqual([
      'invalidate',
      'read',
      'read',
      'read',
      'forget',
      'read',
      'survives'
    ])
  })

  test('keeps the actor and says so when the pages never run out', async () => {
    const endless = Array.from({ length: 80 }, () => page(1, 200))
    const { outcome, order, thrown } = await promoting({ pages: endless })

    expect(outcome.promoted && outcome.complete).toBe(false)
    expect(order).not.toContain('forget')
    expect(thrown).toEqual([])
  })

  test('names the actor it could not empty so the merge can continue', async () => {
    const endless = Array.from({ length: 80 }, () => page(1, 200))
    const { outcome } = await promoting({ pages: endless })

    expect(outcome.promoted && outcome.merged).toBe(anonymous.id)
  })

  test('carries what a stopped promotion left behind when it resumes', async () => {
    const { outcome: first } = await promoting({
      pages: Array.from({ length: 80 }, () => page(1, 200))
    })

    expect(first.promoted && first.complete).toBe(false)

    const { outcome: resumed, moved } = await promoting({
      pages: [page(9001, 2)]
    })

    expect(resumed.promoted && resumed.complete).toBe(true)
    expect(resumed.promoted && resumed.carried).toBe(2)
    expect(moved).toEqual(['member-9001', 'member-9002'])
  })

  test('reports a promotion that emptied the actor as complete', async () => {
    const { outcome } = await promoting({ pages: [page(1, 3)] })

    expect(outcome.promoted && outcome.complete).toBe(true)
  })
})

describe('promote settling the actors it merges', () => {
  test('forgets an actor that held nothing at all', async () => {
    const { outcome, order } = await promoting({ pages: [[]] })

    expect(outcome.promoted && outcome.carried).toBe(0)
    expect(order).toEqual(['invalidate', 'read', 'forget', 'read', 'survives'])
  })

  test('refuses without touching anything when the grant lost its race', async () => {
    const { outcome, order } = await promoting({
      pages: [page(1, 1)],
      invalidates: false
    })

    expect(outcome).toEqual({ promoted: false, refusal: 'stale-grant' })
    expect(order).toEqual(['invalidate'])
  })

  test('sweeps again when a late membership blocks forgetting the actor', async () => {
    const { outcome, order } = await promoting({ pages: [[]], blocked: true })

    expect(outcome.promoted && outcome.complete).toBe(true)
    expect(order.filter(step => step === 'forget')).toHaveLength(2)
  })

  test('erases the owner and refuses when its user vanished meanwhile', async () => {
    const { outcome, order } = await promoting({
      pages: [page(1, 2)],
      survives: false
    })

    expect(outcome).toEqual({ promoted: false, refusal: 'unknown-actor' })
    expect(order.filter(step => step === 'forget')).toHaveLength(2)
  })
})

const request = {
  userId: 'user-1',
  actorId: 'anon',
  authority: { kind: 'grant', epoch: 3 },
  now: NOW
} as const

const cutShort = () => {
  const held = page(1, 10_001)
  const moved = new Set<string>()
  let epoch = 3

  const instance: PromotionStore = {
    ...store({ pages: [] }).instance,
    byId: () => Promise.resolve({ ...anonymous, grantEpoch: epoch }),
    invalidate: (_actorId, presented) => {
      if (presented !== epoch) return Promise.resolve(false)

      epoch++

      return Promise.resolve(true)
    },
    heldBy: () =>
      Promise.resolve(
        held.filter(member => !moved.has(member.id)).slice(0, 200)
      ),
    reassign: id => {
      moved.add(id)

      return Promise.resolve(true)
    }
  }

  return { instance, remaining: () => held.length - moved.size }
}

describe('promote cut short by the page bound', () => {
  test('reports the promotion as incomplete and keeps what is left', async () => {
    const { instance, remaining } = cutShort()
    const first = await promote(request, instance)

    expect(first.promoted && first.complete).toBe(false)
    expect(first.promoted && first.carried).toBe(10_000)
    expect(remaining()).toBe(1)
  })

  test('refuses to resume with the grant the first pass spent', async () => {
    const { instance, remaining } = cutShort()

    await promote(request, instance)

    expect(await promote(request, instance)).toEqual({
      promoted: false,
      refusal: 'stale-grant'
    })
    expect(remaining()).toBe(1)
  })

  test('finishes the promotion when the server resumes it', async () => {
    const { instance, remaining } = cutShort()

    await promote(request, instance)

    const resumed = await promote(
      { ...request, authority: { kind: 'server' } },
      instance
    )

    expect(resumed.promoted && resumed.complete).toBe(true)
    expect(resumed.promoted && resumed.carried).toBe(1)
    expect(remaining()).toBe(0)
  })
})
