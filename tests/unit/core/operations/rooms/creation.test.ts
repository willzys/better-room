import { describe, expect, test } from 'bun:test'

import { createRoom } from '@/core/operations/rooms/creation'

import { EARLIER, NOW } from '../../../../helpers/fixtures'
import { room, minter } from '../../../../helpers/fixtures'

import type {
  CreationOutcome,
  CreationStore
} from '@/core/operations/rooms/creation'

const store = (seed: { issued?: boolean[]; failure?: Error }) => {
  const order: string[] = []
  const opened: Parameters<CreationStore['openRoom']>[0][] = []
  const issued: string[] = []
  const discarded: string[] = []
  const outcomes = [...(seed.issued ?? [true])]

  const instance: CreationStore = {
    openRoom: request => {
      order.push('room')
      opened.push(request)

      return Promise.resolve(room(request))
    },
    issueCode: identifier => {
      order.push('code')
      issued.push(identifier)

      return seed.failure === undefined
        ? Promise.resolve(outcomes.shift() ?? true)
        : Promise.reject(seed.failure)
    },
    discardRoom: roomId => {
      discarded.push(roomId)

      return Promise.resolve()
    }
  }

  return { instance, order, opened, issued, discarded }
}

const request = (
  overrides: Partial<Parameters<typeof createRoom>[0]> = {}
) => ({
  createdBy: null,
  maxMembers: null,
  expiresAt: null,
  mint: minter(),
  now: NOW,
  ...overrides
})

const createdOf = (outcome: CreationOutcome) => {
  if (!outcome.created) throw new Error(`refused as ${outcome.refusal}`)

  return outcome
}

describe('createRoom', () => {
  test('opens the room and returns the plaintext code once', async () => {
    const { instance, issued } = store({})
    const created = createdOf(await createRoom(request(), instance))

    expect(created.code).toBe('CODE1')
    expect(created.room.id).toBe('room-1')
    expect(issued).toEqual(['identifier-1'])
  })

  test('carries the creator, the seats and the expiry onto the room', async () => {
    const expiresAt = new Date(NOW.getTime() + 3600_000)
    const { instance, opened } = store({})

    const created = createdOf(
      await createRoom(
        request({ createdBy: 'actor-1', maxMembers: 4, expiresAt }),
        instance
      )
    )

    expect(opened).toEqual([{ createdBy: 'actor-1', maxMembers: 4, expiresAt }])
    expect(created.room.maxMembers).toBe(4)
    expect(created.room.createdBy).toBe('actor-1')
  })

  test('mints again when the identifier was already taken', async () => {
    const { instance, issued } = store({ issued: [false, false, true] })
    const created = createdOf(await createRoom(request(), instance))

    expect(created.code).toBe('CODE3')
    expect(issued).toEqual(['identifier-1', 'identifier-2', 'identifier-3'])
  })

  test('opens the room before issuing its code', async () => {
    const { instance, order } = store({})

    await createRoom(request(), instance)

    expect(order).toEqual(['room', 'code'])
  })
})

describe('createRoom refusing', () => {
  test.each([
    ['already passed', EARLIER],
    ['is exactly now', NOW]
  ])(
    'refuses an expiry that %s before opening a room',
    async (_label, expiresAt) => {
      const { instance, opened } = store({})

      expect(await createRoom(request({ expiresAt }), instance)).toEqual({
        created: false,
        refusal: 'expires-in-the-past'
      })
      expect(opened).toEqual([])
    }
  )

  test('gives up after bounded attempts and discards the room it opened', async () => {
    const { instance, issued, discarded } = store({
      issued: [false, false, false, false, false, false, false]
    })

    expect(await createRoom(request(), instance)).toEqual({
      created: false,
      refusal: 'exhausted'
    })
    expect(issued).toHaveLength(5)
    expect(discarded).toEqual(['room-1'])
  })

  test('discards the room when the mint cannot produce a usable code', async () => {
    const { instance, discarded } = store({})

    expect(
      await createRoom(request({ mint: () => Promise.resolve(null) }), instance)
    ).toEqual({ created: false, refusal: 'exhausted' })
    expect(discarded).toEqual(['room-1'])
  })

  test('discards the room and rethrows when issuing its code fails', async () => {
    const failure = new Error('database unavailable')
    const { instance, discarded } = store({ failure })

    await expect(createRoom(request(), instance)).rejects.toBe(failure)
    expect(discarded).toEqual(['room-1'])
  })

  test('keeps the room it coded', async () => {
    const { instance, discarded } = store({})

    createdOf(await createRoom(request(), instance))

    expect(discarded).toEqual([])
  })
})
