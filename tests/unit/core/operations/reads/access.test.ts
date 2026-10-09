import { describe, expect, test } from 'bun:test'

import { readAccess } from '@/core/operations/reads/access'

import {
  actor as actorFixture,
  EARLIER,
  LATER,
  membership,
  NOW,
  room
} from '../../../../helpers/fixtures'

import type { Actor } from '@/core/actor'
import type { Membership } from '@/core/membership'
import type { AccessStore } from '@/core/operations/reads/access'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

const actor = actorFixture()

const store = (seed: {
  room?: Usable<Room>
  membership?: Usable<Membership>
  roomWaits?: Promise<void>
}) => {
  const reads: string[] = []

  const instance: AccessStore = {
    room: async () => {
      reads.push('room')
      await seed.roomWaits

      return seed.room === undefined ? room() : seed.room
    },
    membership: () => {
      reads.push('membership')

      return Promise.resolve(seed.membership ?? null)
    }
  }

  return { instance, reads }
}

const read = (
  seed: Parameters<typeof store>[0],
  carrier: Usable<Actor> = actor
) => {
  const { instance, reads } = store(seed)

  return readAccess(
    { roomId: 'room-1', actor: carrier, now: NOW },
    instance
  ).then(access => ({ access, reads }))
}

describe('readAccess', () => {
  test('authorizes a membership the actor still holds', async () => {
    const held = membership()
    const { access } = await read({ membership: held })

    expect(access).toEqual({
      found: true,
      room: room(),
      held,
      related: true,
      authorized: true
    })
  })

  test('issues both reads together rather than one after the other', async () => {
    const gate = Promise.withResolvers<void>()
    const roomWaits = gate.promise
    const { instance, reads } = store({ membership: membership(), roomWaits })

    const pending = readAccess({ roomId: 'room-1', actor, now: NOW }, instance)
    await Promise.resolve()

    expect(reads).toEqual(['room', 'membership'])

    gate.resolve()
    await pending
  })

  test('reports a room nobody could find', async () => {
    const { access } = await read({ room: null })

    expect(access).toEqual({ found: false })
  })

  test('reads no membership when no carrier resolved an actor', async () => {
    const { access, reads } = await read({ membership: membership() }, null)

    expect(reads).toEqual(['room'])
    expect(access).toEqual({
      found: true,
      room: room(),
      held: null,
      related: false,
      authorized: false
    })
  })

  test('reports the room even when the caller holds nothing', async () => {
    const { access } = await read({ membership: null })

    expect(access).toEqual({
      found: true,
      room: room(),
      held: null,
      related: false,
      authorized: false
    })
  })
})

describe('readAccess deciding who is related to the room', () => {
  test('relates a caller who left, since the membership still names it', async () => {
    const { access } = await read({
      membership: membership({ leftAt: EARLIER })
    })

    expect(access.found && access.related).toBe(true)
  })

  test('relates the creator, who holds no membership', async () => {
    const { access } = await read({
      room: room({ createdBy: actor.id }),
      membership: null
    })

    expect(access.found && access.related).toBe(true)
    expect(access.found && access.authorized).toBe(false)
  })

  test('relates no stranger to a room another actor created', async () => {
    const { access } = await read({
      room: room({ createdBy: 'actor-2' }),
      membership: null
    })

    expect(access.found && access.related).toBe(false)
  })
})

describe('readAccess deciding authorization', () => {
  test('keeps authorizing inside a locked room', async () => {
    const { access } = await read({
      room: room({ status: 'locked' }),
      membership: membership()
    })

    expect(access.found && access.authorized).toBe(true)
  })

  test.each([
    ['a closed room', { room: room({ status: 'closed' }) }],
    ['an expired room', { room: room({ expiresAt: EARLIER }) }],
    ['a room that expires on the instant', { room: room({ expiresAt: NOW }) }],
    [
      'a revoked membership',
      { membership: membership({ revokedAt: EARLIER }) }
    ],
    [
      'an expired membership',
      { membership: membership({ expiresAt: EARLIER }) }
    ],
    [
      'a membership the actor left',
      { membership: membership({ leftAt: EARLIER }) }
    ]
  ])(
    'refuses to authorize %s while still reporting it',
    async (_label, seed) => {
      const { access } = await read({ membership: membership(), ...seed })

      expect(access.found).toBe(true)
      expect(access.found && access.authorized).toBe(false)
      expect(access.found && access.held).not.toBeNull()
    }
  )

  test('authorizes while the membership window is still ahead', async () => {
    const { access } = await read({
      membership: membership({ expiresAt: LATER })
    })

    expect(access.found && access.authorized).toBe(true)
  })
})
