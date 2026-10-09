import { describe, expect, test } from 'bun:test'

import { join } from '@/core/operations/admission/join'

import { actor, attempt, joinFake } from '../../../../helpers/admission'
import { room, membership, NOW, EARLIER } from '../../../../helpers/fixtures'

describe('join returning a seat it could not use', () => {
  test('lowers the count and answers with the winner when another enrolment took the seat', async () => {
    const { outcome, calls } = await attempt({ occupies: false })

    expect(outcome).toEqual({
      admitted: true,
      actor,
      membership: membership({ role: 'participant' }),
      changed: false
    })
    expect(calls.lowered).toBe(1)
  })

  test('lowers the count when the rejoin never returned its seat', async () => {
    const { outcome, calls } = await attempt({
      membership: membership({ leftAt: EARLIER }),
      occupies: false
    })

    expect(outcome.admitted).toBe(true)
    expect(calls.reinstate).toBe(1)
    expect(calls.lowered).toBe(1)
  })

  test('lowers nothing when the seat became the occupancy', async () => {
    const { calls } = await attempt({})

    expect(calls.lowered).toBe(0)
  })

  test('refuses a rejoin overtaken by a revocation and keeps no seat for it', async () => {
    const { outcome, calls } = await attempt({
      membership: membership({ leftAt: EARLIER }),
      occupies: false,
      reinstated: { revokedAt: NOW }
    })

    expect(outcome).toEqual({ admitted: false, refusal: 'revoked' })
    expect(calls.lowered).toBe(1)
  })

  test('returns the seat when the vacant row could not be written', async () => {
    const failure = new Error('database unavailable')
    const { instance, calls, resolveActor } = joinFake({})

    await expect(
      join(
        { codeIdentifier: 'identifier', actor: resolveActor, now: NOW },
        { ...instance, enroll: () => Promise.reject(failure) }
      )
    ).rejects.toBe(failure)
    expect(calls.lowered).toBe(1)
  })
})

describe('join racing what removes its membership', () => {
  test('returns the seat and tries again when the membership vanished', async () => {
    const { outcome, calls } = await attempt({ vanishes: true })

    expect(outcome).toEqual({ admitted: false, refusal: 'contended' })
    expect(calls.admit).toBe(4)
    expect(calls.lowered).toBe(4)
  })

  test('tries again when a departure overtook the seat it lost', async () => {
    const { outcome, calls } = await attempt({
      occupies: false,
      reinstated: { leftAt: NOW }
    })

    expect(outcome).toEqual({ admitted: false, refusal: 'contended' })
    expect(calls.admit).toBe(4)
    expect(calls.lowered).toBe(4)
  })

  test('erases an actor that disappeared while it took the seat', async () => {
    const { outcome, calls } = await attempt({ survives: false })

    expect(outcome).toEqual({ admitted: false, refusal: 'unknown-actor' })
    expect(calls.erased).toBe(1)
  })

  test('answers from a fresh read when the gate turns it down', async () => {
    const { instance, resolveActor } = joinFake({ admits: false })
    const reads = [null, membership()]

    const outcome = await join(
      { codeIdentifier: 'identifier', actor: resolveActor, now: NOW },
      {
        ...instance,
        membership: () => Promise.resolve(reads.shift() ?? null)
      }
    )

    expect(outcome).toEqual({
      admitted: true,
      actor,
      membership: membership(),
      changed: false
    })
  })

  test('names the state a room moved to while the gate turned it down', async () => {
    const { instance, resolveActor } = joinFake({ admits: false })
    const reads = [room(), room({ status: 'locked' })]

    const outcome = await join(
      { codeIdentifier: 'identifier', actor: resolveActor, now: NOW },
      { ...instance, room: () => Promise.resolve(reads.shift() ?? null) }
    )

    expect(outcome).toEqual({ admitted: false, refusal: 'locked' })
  })
})
