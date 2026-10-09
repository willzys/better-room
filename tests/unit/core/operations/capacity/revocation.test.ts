import { describe, expect, test } from 'bun:test'

import { revokeMember } from '@/core/operations/capacity/revocation'

import { EARLIER, membership, NOW, room } from '../../../../helpers/fixtures'

import type { Membership } from '@/core/membership'
import type { RevocationStore } from '@/core/operations/capacity/revocation'
import type { Usable } from '@/types/absence'

const store = (seed: {
  revoked: Usable<Membership>
  reread?: Usable<Membership>
  claims?: boolean
}) => {
  const order: string[] = []
  let reads = 0

  const instance: RevocationStore = {
    room: () => Promise.resolve(room()),
    membership: () => {
      reads += 1

      return Promise.resolve(
        reads > 1 && seed.reread !== undefined ? seed.reread : membership()
      )
    },
    revoke: () => {
      order.push('revoke')

      return Promise.resolve(seed.revoked)
    },
    endOccupancy: () => {
      order.push('claim')

      return Promise.resolve(seed.claims ?? true)
    },
    lowerCount: () => {
      order.push('lower')

      return Promise.resolve()
    }
  }

  return { instance, order }
}

const revocation = (seed: Parameters<typeof store>[0]) => {
  const { instance, order } = store(seed)

  return revokeMember(
    { roomId: 'room-1', actorId: 'actor-1', now: NOW },
    instance
  ).then(outcome => ({ outcome, order }))
}

describe('revoking a membership', () => {
  test('returns the membership its own write revoked', async () => {
    const { outcome, order } = await revocation({
      revoked: membership({ revokedAt: NOW })
    })

    expect(outcome.revoked && outcome.membership.revokedAt).toEqual(NOW)
    expect(order).toEqual(['revoke', 'claim', 'lower'])
  })
})

describe('revoking a membership another revocation reached first', () => {
  test('refuses as already revoked instead of reporting an unrevoked row', async () => {
    const { outcome, order } = await revocation({
      revoked: null,
      reread: membership({ revokedAt: EARLIER }),
      claims: false
    })

    expect(outcome).toEqual({ revoked: false, refusal: 'already-revoked' })
    expect(order).toEqual(['revoke', 'claim'])
  })

  test('refuses as not a member when the membership disappeared', async () => {
    const { outcome } = await revocation({
      revoked: null,
      reread: null,
      claims: false
    })

    expect(outcome).toEqual({ revoked: false, refusal: 'not-a-member' })
  })
})
