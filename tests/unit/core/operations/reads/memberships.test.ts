import { describe, expect, test } from 'bun:test'

import { readMemberships } from '@/core/operations/reads/memberships'

import {
  actor as actorFixture,
  EARLIER,
  LATER,
  membership as membershipFixture,
  NOW,
  room as roomFixture
} from '../../../../helpers/fixtures'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { MembershipsStore } from '@/core/operations/reads/memberships'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

const actor = actorFixture()

const room = (id: string, overrides: Partial<Room> = {}) =>
  roomFixture({ id, ...overrides })

const membership = (roomId: string, overrides: Partial<Membership> = {}) =>
  membershipFixture({ id: `member-${roomId}`, roomId, ...overrides })

const store = (seed: {
  held: Membership[]
  rooms?: Room[]
  complete?: boolean
}) => {
  const asked: string[][] = []

  const instance: MembershipsStore = {
    held: () =>
      Promise.resolve({
        memberships: seed.held,
        complete: seed.complete ?? true,
        next:
          seed.complete === false
            ? { branch: 'perpetual', after: 'member-1' }
            : null
      }),
    rooms: ids => {
      asked.push(ids)

      return Promise.resolve(
        seed.rooms ?? seed.held.map(entry => room(entry.roomId))
      )
    }
  }

  return { instance, asked }
}

const read = (
  seed: Parameters<typeof store>[0],
  carrier: Usable<Actor> = actor
) => {
  const { instance, asked } = store(seed)

  return readMemberships(
    { actor: carrier, now: NOW, before: null },
    instance
  ).then(listed => ({ listed, asked }))
}

describe('readMemberships', () => {
  test('pairs every membership with the room it names', async () => {
    const { listed } = await read({ held: [membership('room-1')] })

    expect(listed.held).toEqual([
      { membership: membership('room-1'), room: room('room-1') }
    ])
    expect(listed.complete).toBe(true)
  })

  test('reports an answer the store could not complete', async () => {
    const { listed } = await read({
      held: [membership('room-1')],
      complete: false
    })

    expect(listed.held).toHaveLength(1)
    expect(listed.complete).toBe(false)
  })

  test('still reports incompleteness when nothing survives the filter', async () => {
    const { listed } = await read({
      held: [membership('room-1', { revokedAt: EARLIER })],
      complete: false
    })

    expect(listed).toEqual({
      held: [],
      complete: false,
      next: { branch: 'perpetual', after: 'member-1' }
    })
  })

  test('asks for every named room in a single read', async () => {
    const { asked } = await read({
      held: [membership('room-1'), membership('room-2')]
    })

    expect(asked).toEqual([['room-1', 'room-2']])
  })

  test('reads no room when no carrier resolved an actor', async () => {
    const { listed, asked } = await read({ held: [membership('room-1')] }, null)

    expect(listed).toEqual({ held: [], complete: true, next: null })
    expect(asked).toEqual([])
  })

  test('reads no room when the actor holds none', async () => {
    const { listed, asked } = await read({ held: [] })

    expect(listed).toEqual({ held: [], complete: true, next: null })
    expect(asked).toEqual([])
  })

  test('preserves the order the store returned', async () => {
    const { listed } = await read({
      held: [membership('room-2'), membership('room-1')]
    })

    expect(listed.held.map(entry => entry.room.id)).toEqual([
      'room-2',
      'room-1'
    ])
  })
})

describe('readMemberships keeping only what authorizes', () => {
  test.each<[string, Partial<Room>, Partial<Membership>]>([
    ['a closed room', { status: 'closed' }, {}],
    ['an expired room', { expiresAt: EARLIER }, {}],
    ['a revoked membership', {}, { revokedAt: EARLIER }],
    ['an expired membership', {}, { expiresAt: EARLIER }],
    ['a membership the actor left', {}, { leftAt: EARLIER }]
  ])('leaves out %s', async (_label, onRoom, onMembership) => {
    const { listed } = await read({
      held: [membership('room-1', onMembership), membership('room-2')],
      rooms: [room('room-1', onRoom), room('room-2')]
    })

    expect(listed.held.map(entry => entry.membership.roomId)).toEqual([
      'room-2'
    ])
  })

  test('keeps a locked room the actor is already inside', async () => {
    const { listed } = await read({
      held: [membership('room-1')],
      rooms: [room('room-1', { status: 'locked' })]
    })

    expect(listed.held).toHaveLength(1)
  })

  test('keeps a membership whose window is still ahead', async () => {
    const { listed } = await read({
      held: [membership('room-1', { expiresAt: LATER })]
    })

    expect(listed.held).toHaveLength(1)
  })

  test('leaves out a membership whose room came back missing', async () => {
    const { listed } = await read({
      held: [membership('room-1'), membership('room-2')],
      rooms: [room('room-2')]
    })

    expect(listed.held.map(entry => entry.room.id)).toEqual(['room-2'])
  })
})
