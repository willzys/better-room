import { describe, expect, test } from 'bun:test'

import { addMember } from '@/core/operations/admission/addition'

import { erasure } from '../../../../helpers/admission'
import { NOW, EARLIER, LATER } from '../../../../helpers/fixtures'
import { room, membership } from '../../../../helpers/fixtures'

import type { Membership } from '@/core/membership'
import type {
  AdditionRefusal,
  AdditionStore
} from '@/core/operations/admission/addition'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

type Calls = {
  order: string[]
  admit: number
  enrolled: Parameters<AdditionStore['enroll']>[0][]
  lowered: number
  erased: number
}

const store = (seed: {
  room?: Usable<Room>
  membership?: Usable<Membership>
  admits?: boolean
  occupies?: boolean
  readmitted?: Partial<Membership>
  survives?: boolean
}) => {
  const calls: Calls = {
    order: [],
    admit: 0,
    enrolled: [],
    lowered: 0,
    erased: 0
  }

  const instance: AdditionStore = {
    room: () => Promise.resolve(seed.room === undefined ? room() : seed.room),
    membership: () => Promise.resolve(seed.membership ?? null),
    admit: () => {
      calls.order.push('admit')
      calls.admit++

      return Promise.resolve(seed.admits ?? true)
    },
    enroll: member => {
      calls.order.push('enroll')
      calls.enrolled.push(member)

      return Promise.resolve(membership({ ...member, leftAt: NOW }))
    },
    occupy: (id, terms) => {
      calls.order.push('occupy')

      return Promise.resolve({
        membership: membership({ id, ...terms }),
        occupied: seed.occupies ?? true
      })
    },
    reinstate: () => Promise.resolve(null),
    readmit: (id, terms) => {
      calls.order.push('readmit')

      return Promise.resolve({
        membership: membership({ id, ...terms, ...seed.readmitted }),
        occupied: seed.readmitted === undefined
      })
    },
    lowerCount: () => {
      calls.order.push('lower')
      calls.lowered++

      return Promise.resolve()
    },
    survives: () => Promise.resolve(seed.survives ?? true),
    erasure: erasure(calls)
  }

  return { instance, calls }
}

const add = (
  seed: Parameters<typeof store>[0],
  request: Partial<Parameters<typeof addMember>[0]> = {}
) => {
  const { instance, calls } = store(seed)

  return addMember(
    {
      roomId: 'room-1',
      actor: { id: 'actor-1', userId: null },
      role: 'organizer',
      expiresAt: null,
      now: NOW,
      ...request
    },
    instance
  ).then(outcome => ({ outcome, calls }))
}

describe('addMember', () => {
  test('enrols with the role the application named', async () => {
    const { outcome, calls } = await add({})

    expect(outcome.added).toBe(true)
    expect(calls.enrolled).toEqual([
      {
        roomId: 'room-1',
        actorId: 'actor-1',
        role: 'organizer',
        expiresAt: null
      }
    ])
  })

  test('carries the validity window it was given', async () => {
    const { calls } = await add({}, { expiresAt: LATER })

    expect(calls.enrolled[0]?.expiresAt).toEqual(LATER)
  })

  test('passes the admission gate before writing', async () => {
    const { calls } = await add({})

    expect(calls.order).toEqual(['admit', 'enroll', 'occupy'])
  })

  test('refuses at capacity without writing', async () => {
    const { outcome, calls } = await add({ admits: false })

    expect(outcome).toEqual({ added: false, refusal: 'at-capacity' })
    expect(calls.enrolled).toEqual([])
  })

  test('adds to a locked room, since locking only refuses a join', async () => {
    const { outcome } = await add({ room: room({ status: 'locked' }) })

    expect(outcome.added).toBe(true)
  })

  const refusals: [AdditionRefusal, Room][] = [
    ['closed', room({ status: 'closed' })],
    ['expired', room({ expiresAt: EARLIER })]
  ]

  test.each(refusals)(
    'refuses a %s room without touching the gate',
    async (refusal, seeded) => {
      const { outcome, calls } = await add({ room: seeded })

      expect(outcome).toEqual({ added: false, refusal })
      expect(calls.admit).toBe(0)
    }
  )

  test('refuses an unknown room', async () => {
    const { outcome } = await add({ room: null })

    expect(outcome).toEqual({ added: false, refusal: 'unknown-room' })
  })
})

describe('addMember returning a seat it could not use', () => {
  test('refuses an expiry that already passed, touching nothing', async () => {
    const { outcome, calls } = await add({}, { expiresAt: EARLIER })

    expect(outcome).toEqual({
      added: false,
      refusal: 'expires-in-the-past'
    })
    expect(calls.order).toEqual([])
  })

  test('refuses an expiry of exactly now', async () => {
    const { outcome } = await add({}, { expiresAt: NOW })

    expect(outcome).toEqual({
      added: false,
      refusal: 'expires-in-the-past'
    })
  })

  test('accepts an expiry still ahead', async () => {
    const { outcome } = await add({}, { expiresAt: LATER })

    expect(outcome.added).toBe(true)
  })

  test('lowers the count when the insert lost to another caller', async () => {
    const { outcome, calls } = await add({ occupies: false })

    expect(outcome).toEqual({ added: false, refusal: 'already-a-member' })
    expect(calls.order).toEqual(['admit', 'enroll', 'occupy', 'lower'])
    expect(calls.lowered).toBe(1)
  })

  test('lowers nothing when the insert took the seat', async () => {
    const { calls } = await add({})

    expect(calls.lowered).toBe(0)
  })

  test('erases an actor that disappeared while it took the seat', async () => {
    const { outcome, calls } = await add({ survives: false })

    expect(outcome).toEqual({ added: false, refusal: 'unknown-actor' })
    expect(calls.erased).toBe(1)
  })

  test('names the state a room moved to while the gate turned it down', async () => {
    const { instance, calls } = store({ admits: false })
    const reads = [room(), room({ status: 'closed' })]

    const outcome = await addMember(
      {
        roomId: 'room-1',
        actor: { id: 'actor-1', userId: null },
        role: 'organizer',
        expiresAt: null,
        now: NOW
      },
      { ...instance, room: () => Promise.resolve(reads.shift() ?? null) }
    )

    expect(outcome).toEqual({ added: false, refusal: 'closed' })
    expect(calls.enrolled).toEqual([])
  })
})

describe('addMember facing a membership the actor already has', () => {
  test.each<[string, Membership, AdditionRefusal]>([
    ['a membership already held', membership(), 'already-a-member'],
    ['a revoked membership', membership({ revokedAt: EARLIER }), 'revoked']
  ])(
    'refuses %s rather than overwriting it',
    async (_label, existing, refusal) => {
      const { outcome, calls } = await add({ membership: existing })

      expect(outcome).toEqual({ added: false, refusal })
      expect(calls.admit).toBe(0)
    }
  )
})

describe('addMember readmitting a member who left', () => {
  const left = membership({ leftAt: EARLIER, role: 'participant' })

  test('takes the seat back with the role and window it names now', async () => {
    const { outcome, calls } = await add(
      { membership: left },
      { role: 'organizer', expiresAt: LATER }
    )

    expect(outcome).toMatchObject({
      added: true,
      membership: { id: left.id, role: 'organizer', expiresAt: LATER }
    })
    expect(calls.order).toEqual(['admit', 'readmit'])
    expect(calls.enrolled).toEqual([])
  })

  test('refuses at capacity without touching the membership', async () => {
    const { outcome, calls } = await add({ membership: left, admits: false })

    expect(outcome).toEqual({ added: false, refusal: 'at-capacity' })
    expect(calls.order).toEqual(['admit'])
  })

  test('returns the seat and names a revocation that landed first', async () => {
    const { outcome, calls } = await add({
      membership: left,
      readmitted: { revokedAt: NOW }
    })

    expect(outcome).toEqual({ added: false, refusal: 'revoked' })
    expect(calls.order).toEqual(['admit', 'readmit', 'lower'])
  })
})
