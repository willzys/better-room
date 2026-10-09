import { describe, expect, test } from 'bun:test'

import { settleRoom } from '@/core/operations/rooms/lifecycle'

import { room } from '../../../../helpers/fixtures'

import type {
  LifecycleStore,
  Transition
} from '@/core/operations/rooms/lifecycle'
import type { Room, RoomStatus } from '@/core/room'
import type { Usable } from '@/types/absence'

const store = (seed: {
  reads: Usable<Room>[]
  settles?: (status: RoomStatus) => Usable<Room>
}) => {
  const writes: RoomStatus[] = []
  let read = 0

  const instance: LifecycleStore = {
    room: () => {
      const current = seed.reads[Math.min(read, seed.reads.length - 1)]
      read += 1

      return Promise.resolve(current ?? null)
    },
    settle: (_roomId, status) => {
      writes.push(status)

      return Promise.resolve(
        seed.settles === undefined ? room({ status }) : seed.settles(status)
      )
    }
  }

  return { instance, writes }
}

const settling = (
  transition: Transition,
  seed: Parameters<typeof store>[0]
) => {
  const { instance, writes } = store(seed)

  return settleRoom({ roomId: 'room-1', transition }, instance).then(
    outcome => ({ outcome, writes })
  )
}

describe('changing the state of a room', () => {
  test.each([
    ['lock', 'active', 'locked'],
    ['unlock', 'locked', 'active'],
    ['close', 'active', 'closed'],
    ['close', 'locked', 'closed']
  ] as const)(
    '%s moves a room from %s to %s in one write',
    async (transition, from, to) => {
      const { outcome, writes } = await settling(transition, {
        reads: [room({ status: from })]
      })

      expect(outcome.settled && outcome.room.status).toBe(to)
      expect(writes).toEqual([to])
    }
  )

  test.each([
    ['lock', 'locked'],
    ['unlock', 'active'],
    ['close', 'closed']
  ] as const)(
    '%s succeeds without writing when the room is already %s',
    async (transition, status) => {
      const { outcome, writes } = await settling(transition, {
        reads: [room({ status })]
      })

      expect(outcome.settled && outcome.room.status).toBe(status)
      expect(writes).toEqual([])
    }
  )
})

describe('changing the state of a room refused', () => {
  test('refuses a room that does not exist', async () => {
    const { outcome, writes } = await settling('lock', { reads: [null] })

    expect(outcome).toEqual({ settled: false, refusal: 'unknown-room' })
    expect(writes).toEqual([])
  })

  test.each(['lock', 'unlock'] as const)(
    'refuses to %s a closed room, since closing cannot be undone',
    async transition => {
      const { outcome, writes } = await settling(transition, {
        reads: [room({ status: 'closed' })]
      })

      expect(outcome).toEqual({ settled: false, refusal: 'closed' })
      expect(writes).toEqual([])
    }
  )

  test('re-reads after a refused write and refuses once the room has closed', async () => {
    const { outcome, writes } = await settling('lock', {
      reads: [room({ status: 'active' }), room({ status: 'closed' })],
      settles: () => null
    })

    expect(outcome).toEqual({ settled: false, refusal: 'closed' })
    expect(writes).toEqual(['locked'])
  })

  test('reports contention when the room keeps changing under every attempt', async () => {
    const { outcome, writes } = await settling('lock', {
      reads: [room({ status: 'active' })],
      settles: () => null
    })

    expect(outcome).toEqual({ settled: false, refusal: 'contended' })
    expect(writes).toEqual(['locked', 'locked', 'locked'])
  })
})
