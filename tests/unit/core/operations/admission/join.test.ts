import { describe, expect, test } from 'bun:test'

import { join } from '@/core/operations/admission/join'

import { actor, attempt, joinFake } from '../../../../helpers/admission'
import {
  room,
  membership,
  roomCode as code,
  NOW,
  EARLIER,
  LATER
} from '../../../../helpers/fixtures'

import type { Room, RoomRefusal } from '@/core/room'

describe('join resolving the code', () => {
  test.each([
    ['a code that does not exist', { code: null }],
    ['a revoked code', { code: code({ status: 'revoked' }) }],
    ['a code revoked by timestamp', { code: code({ revokedAt: EARLIER }) }],
    ['a code past its grace window', { code: code({ expiresAt: EARLIER }) }],
    ['a code at the exact expiry', { code: code({ expiresAt: NOW }) }],
    ['a code pointing at no room', { room: null }]
  ])('refuses %s as unresolved', async (_label, seed) => {
    const { outcome, calls } = await attempt(seed)

    expect(outcome).toEqual({ admitted: false, refusal: 'unresolved' })
    expect(calls).toEqual({
      actor: 0,
      admit: 0,
      enroll: 0,
      occupy: 0,
      reinstate: 0,
      lowered: 0,
      erased: 0
    })
  })

  test('admits a code inside its grace window', async () => {
    const { outcome } = await attempt({
      code: code({ status: 'grace', expiresAt: LATER })
    })

    expect(outcome.admitted).toBe(true)
  })
})

describe('join reading the room', () => {
  const refusals: [RoomRefusal, Room][] = [
    ['closed', room({ status: 'closed' })],
    ['locked', room({ status: 'locked' })],
    ['expired', room({ expiresAt: NOW })]
  ]

  test.each(refusals)('refuses a %s room by name', async (refusal, seeded) => {
    const { outcome, calls } = await attempt({ room: seeded })
    expect(calls.actor).toBe(0)
    expect(outcome).toEqual({
      admitted: false,
      refusal
    })
  })

  test('reports a closed room that also expired as closed', async () => {
    const { outcome } = await attempt({
      room: room({ status: 'closed', expiresAt: EARLIER })
    })

    expect(outcome).toEqual({ admitted: false, refusal: 'closed' })
  })

  test('admits a room whose expiry is still ahead', async () => {
    const { outcome } = await attempt({ room: room({ expiresAt: LATER }) })
    expect(outcome.admitted).toBe(true)
  })
})

describe('join against an existing membership', () => {
  test('refuses a revoked membership', async () => {
    const { outcome, calls } = await attempt({
      membership: membership({ revokedAt: EARLIER })
    })

    expect(outcome).toEqual({ admitted: false, refusal: 'revoked' })
    expect(calls.admit).toBe(0)
  })

  test('refuses an expired membership instead of reinstating it', async () => {
    const { outcome, calls } = await attempt({
      membership: membership({ role: 'host', expiresAt: NOW, leftAt: EARLIER })
    })

    expect(outcome).toEqual({ admitted: false, refusal: 'membership-expired' })
    expect(calls.reinstate).toBe(0)
  })

  test('returns the held membership without consuming a seat', async () => {
    const held = membership()
    const { outcome, calls } = await attempt({ membership: held })

    expect(outcome).toEqual({
      admitted: true,
      actor,
      membership: held,
      changed: false
    })
    expect(calls.admit).toBe(0)
    expect(calls.enroll).toBe(0)
  })

  test('reinstates after leaving, through the capacity gate', async () => {
    const { outcome, calls } = await attempt({
      membership: membership({ leftAt: EARLIER })
    })

    expect(outcome.admitted).toBe(true)
    expect(calls.admit).toBe(1)
    expect(calls.reinstate).toBe(1)
    expect(calls.enroll).toBe(0)
  })

  test('refuses a rejoin whose membership was revoked while it took the seat', async () => {
    const { outcome, calls } = await attempt({
      membership: membership({ leftAt: EARLIER }),
      reinstated: { revokedAt: NOW }
    })

    expect(outcome).toEqual({ admitted: false, refusal: 'revoked' })
    expect(calls.reinstate).toBe(1)
  })

  test('refuses a reinstatement the gate turns down', async () => {
    const { outcome, calls } = await attempt({
      membership: membership({ leftAt: EARLIER }),
      admits: false
    })

    expect(outcome).toEqual({ admitted: false, refusal: 'at-capacity' })
    expect(calls.reinstate).toBe(0)
  })
})

describe('join enrolling a new member', () => {
  test('enrols through the gate with the default role', async () => {
    const { outcome, calls } = await attempt({})

    expect(outcome).toEqual({
      admitted: true,
      actor,
      membership: membership({ role: 'participant' }),
      changed: true
    })
    expect(calls.admit).toBe(1)
    expect(calls.enroll).toBe(1)
    expect(calls.occupy).toBe(1)
  })

  test('refuses when the gate turns the join down', async () => {
    const { outcome, calls } = await attempt({ admits: false })

    expect(outcome).toEqual({ admitted: false, refusal: 'at-capacity' })
    expect(calls.enroll).toBe(0)
  })

  test('passes the gate before writing the membership', async () => {
    const order: string[] = []
    const { instance: seeded, resolveActor } = joinFake({})

    await join(
      { codeIdentifier: 'identifier', actor: resolveActor, now: NOW },
      {
        ...seeded,
        admit: async (...args) => {
          order.push('admit')

          return seeded.admit(...args)
        },
        enroll: async (...args) => {
          order.push('enroll')

          return seeded.enroll(...args)
        },
        occupy: async (...args) => {
          order.push('occupy')

          return seeded.occupy(...args)
        }
      }
    )

    expect(order).toEqual(['admit', 'enroll', 'occupy'])
  })
})
