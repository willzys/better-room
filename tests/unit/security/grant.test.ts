import { describe, expect, test } from 'bun:test'

import { decodeGrant, encodeGrant, isLive } from '@/security/grant'

const grant = { actorId: 'actor-1', epoch: 3, expiresAt: 1_700_000_000_000 }

describe('encodeGrant', () => {
  test('puts the version first and the actor last', () => {
    expect(encodeGrant(grant)).toBe('v1.3.1700000000000.actor-1')
  })

  test('survives an actor id containing the separator', () => {
    const dotted = { ...grant, actorId: 'tenant.a.actor.1' }

    expect(decodeGrant(encodeGrant(dotted))).toEqual(dotted)
  })

  test('round trips the whole payload', () => {
    expect(decodeGrant(encodeGrant(grant))).toEqual(grant)
  })
})

describe('decodeGrant', () => {
  test.each([
    '',
    'v2.3.1700000000000.actor-1',
    'v1.3.1700000000000',
    'v1.3.1700000000000.',
    'v1..1700000000000.actor-1',
    'v1.3..actor-1',
    'v1.-3.1700000000000.actor-1',
    'v1.3.99999999999999999999.actor-1',
    'v1.three.1700000000000.actor-1'
  ])('rejects the unreadable value %p', value => {
    expect(decodeGrant(value)).toBeNull()
  })
})

describe('isLive', () => {
  test('is live strictly before its expiry', () => {
    expect(isLive(grant, new Date(grant.expiresAt - 1))).toBe(true)
    expect(isLive(grant, new Date(grant.expiresAt))).toBe(false)
    expect(isLive(grant, new Date(grant.expiresAt + 1))).toBe(false)
  })
})
