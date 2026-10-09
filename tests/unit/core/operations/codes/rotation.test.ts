import { describe, expect, test } from 'bun:test'

import { rotateCode } from '@/core/operations/codes/rotation'

import { EARLIER, NOW } from '../../../../helpers/fixtures'
import { room, minter } from '../../../../helpers/fixtures'

import type { RotationStore } from '@/core/operations/codes/rotation'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

const GRACE = 120

type Calls = {
  order: string[]
  retired: Date[]
  demoted: { codeIds: string[]; until: Date }[]
}

const store = (seed: { room?: Usable<Room>; issued?: boolean[] }) => {
  const calls: Calls = { order: [], retired: [], demoted: [] }
  const outcomes = [...(seed.issued ?? [true])]

  const instance: RotationStore = {
    room: () => Promise.resolve(seed.room === undefined ? room() : seed.room),
    retireGrace: (_roomId, at) => {
      calls.order.push('retire')
      calls.retired.push(at)

      return Promise.resolve()
    },
    activeCodes: () => {
      calls.order.push('read')

      return Promise.resolve(['code-before'])
    },
    issueCode: () => {
      calls.order.push('issue')

      return Promise.resolve(outcomes.shift() ?? true)
    },
    demoteOthers: (_roomId, codeIds, until) => {
      calls.order.push('demote')
      calls.demoted.push({ codeIds, until })

      return Promise.resolve()
    }
  }

  return { instance, calls }
}

const rotate = (seed: Parameters<typeof store>[0]) => {
  const { instance, calls } = store(seed)

  return rotateCode(
    { roomId: 'room-1', mint: minter(), grace: GRACE, now: NOW },
    instance
  ).then(outcome => ({ outcome, calls }))
}

describe('rotateCode', () => {
  test('returns the new plaintext code', async () => {
    const { outcome } = await rotate({})

    expect(outcome).toEqual({ rotated: true, code: 'CODE1' })
  })

  test('issues the new code before demoting the old one', async () => {
    const { calls } = await rotate({})

    expect(calls.order).toEqual(['retire', 'read', 'issue', 'demote'])
  })

  test('demotes the codes it read before issuing, and nothing else', async () => {
    const { calls } = await rotate({})

    expect(calls.demoted).toEqual([
      {
        codeIds: ['code-before'],
        until: new Date(NOW.getTime() + GRACE * 1000)
      }
    ])
  })

  test('retires an older grace code before issuing', async () => {
    const { calls } = await rotate({})

    expect(calls.retired).toEqual([NOW])
    expect(calls.order.indexOf('retire')).toBeLessThan(
      calls.order.indexOf('issue')
    )
  })

  test('mints again when the identifier was taken', async () => {
    const { outcome } = await rotate({ issued: [false, true] })

    expect(outcome).toEqual({ rotated: true, code: 'CODE2' })
  })

  test('rotates a locked room, since locking is not the end of it', async () => {
    const { outcome } = await rotate({ room: room({ status: 'locked' }) })

    expect(outcome.rotated).toBe(true)
  })

  test('reports exhaustion without demoting the code still in use', async () => {
    const { outcome, calls } = await rotate({
      issued: [false, false, false, false, false]
    })

    expect(outcome).toEqual({ rotated: false, refusal: 'exhausted' })
    expect(calls.demoted).toEqual([])
  })
})

describe('rotateCode refusing', () => {
  test('refuses a room that does not exist, touching nothing', async () => {
    const { outcome, calls } = await rotate({ room: null })

    expect(outcome).toEqual({ rotated: false, refusal: 'unknown-room' })
    expect(calls.order).toEqual([])
  })

  test('refuses a closed room, touching nothing', async () => {
    const { outcome, calls } = await rotate({
      room: room({ status: 'closed' })
    })

    expect(outcome).toEqual({ rotated: false, refusal: 'closed' })
    expect(calls.order).toEqual([])
  })

  test.each([
    ['already passed', EARLIER],
    ['is exactly now', NOW]
  ])(
    'refuses a room whose expiry %s, touching nothing',
    async (_label, expiresAt) => {
      const { outcome, calls } = await rotate({ room: room({ expiresAt }) })

      expect(outcome).toEqual({ rotated: false, refusal: 'expired' })
      expect(calls.order).toEqual([])
    }
  )
})
