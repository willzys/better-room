import { describe, expect, test } from 'bun:test'

import { recountCapacity } from '@/core/operations/capacity/recount'

import { room } from '../../../../helpers/fixtures'

import type { RecountStore } from '@/core/operations/capacity/recount'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

const store = (seed: {
  room: Usable<Room>
  held: number
  settles?: boolean
}) => {
  const settled: [number, number][] = []
  const instance: RecountStore = {
    room: () => Promise.resolve(seed.room),
    held: () => Promise.resolve(seed.held),
    settle: (_roomId, from, to) => {
      settled.push([from, to])

      return Promise.resolve(seed.settles ?? true)
    }
  }

  return { instance, settled }
}

const locked = room({ status: 'locked', memberCount: 3 })

describe('recountCapacity', () => {
  test('lowers the counter of a locked room to the seats its memberships hold', async () => {
    const { instance, settled } = store({ room: locked, held: 2 })

    expect(await recountCapacity({ roomId: 'room-1' }, instance)).toEqual({
      recounted: true,
      before: 3,
      after: 2
    })
    expect(settled).toEqual([[3, 2]])
  })

  test('writes nothing when the counter already matches', async () => {
    const { instance, settled } = store({ room: locked, held: 3 })

    expect(await recountCapacity({ roomId: 'room-1' }, instance)).toEqual({
      recounted: true,
      before: 3,
      after: 3
    })
    expect(settled).toEqual([])
  })

  test.each([
    ['an open room', room(), 'not-locked'],
    ['a missing room', null, 'unknown-room']
  ] as const)('refuses %s', async (_label, seeded, refusal) => {
    const { instance } = store({ room: seeded, held: 0 })

    expect(await recountCapacity({ roomId: 'room-1' }, instance)).toEqual({
      recounted: false,
      refusal
    })
  })

  test('gives up as contended when the counter keeps moving', async () => {
    const { instance, settled } = store({
      room: locked,
      held: 2,
      settles: false
    })

    expect(await recountCapacity({ roomId: 'room-1' }, instance)).toEqual({
      recounted: false,
      refusal: 'contended'
    })
    expect(settled).toHaveLength(4)
  })
})
