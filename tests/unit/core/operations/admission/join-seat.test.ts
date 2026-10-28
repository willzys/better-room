import { describe, expect, test } from 'bun:test'

import { join } from '@/core/operations/admission/join'

import { actor, attempt, joinFake } from '../../../../helpers/admission'
import { actor as actorOf, EARLIER, NOW } from '../../../../helpers/fixtures'

describe('join seating an actor', () => {
  test('reads no membership for an actor it has just created', async () => {
    const { instance, actors } = joinFake({})
    let reads = 0

    await join(
      {
        codeIdentifiers: ['identifier'],
        actor: actors,
        seatLifetime: null,
        now: NOW
      },
      {
        ...instance,
        membership: async (...args) => {
          reads++

          return instance.membership(...args)
        }
      }
    )

    expect(reads).toBe(0)
  })

  test('gives an anonymous seat the deadline of its actor when seats expire', async () => {
    const { outcome } = await attempt({ seatLifetime: 3600 })

    expect(outcome.admitted && outcome.membership.expiresAt).toEqual(
      new Date(EARLIER.getTime() + 3_600_000)
    )
  })

  test('leaves a seat without a deadline unless seats expire', async () => {
    const { outcome } = await attempt({})

    expect(outcome.admitted && outcome.membership.expiresAt).toBeNull()
  })

  test('gives a signed in user a seat without a deadline even when seats expire', async () => {
    const { outcome } = await attempt({
      found: actorOf({ userId: 'user-1' }),
      seatLifetime: 1
    })

    expect(outcome.admitted && outcome.membership.expiresAt).toBeNull()
  })

  test('starts a new actor once the one the caller carries has lapsed', async () => {
    const createdAt = new Date(NOW.getTime() - 7_200_000)
    const { outcome, calls } = await attempt({
      found: actorOf({ createdAt }),
      seatLifetime: 3600
    })

    expect(calls.actor).toBe(1)
    expect(outcome.admitted && outcome.actor).toEqual(actor)
  })
})
