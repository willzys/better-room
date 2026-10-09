import { describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'

import { codeFormat } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

import { countingImports } from '../../helpers/crypto'

const crockford = codeFormat('crockford')
const short = codeFormat('crockford', 4)
const numeric = codeFormat('numeric')

const identify = (secret: string, format = crockford) =>
  codeIdentifier({ format, secret })

const reference = (secret: string, canonical: string) =>
  createHmac(
    'sha256',
    createHmac('sha256', secret).update('better-room:code:v1').digest()
  )
    .update(canonical)
    .digest('hex')

describe('codeIdentifier', () => {
  test.each([
    ['crockford', 'ABCD1234', 'secret'],
    ['numeric', '012345', 'another-secret'],
    ['crockford', '0', 'short-secret'],
    ['numeric', '9'.repeat(64), 'unicode-🔑']
  ] as const)(
    'matches the reference for %s code %s',
    async (name, code, secret) => {
      expect(await identify(secret, codeFormat(name, code.length))(code)).toBe(
        reference(secret, code)
      )
    }
  )

  test('changes with the secret', async () => {
    const [first, second] = await Promise.all([
      identify('first')('ABCD1234'),
      identify('second')('ABCD1234')
    ])

    expect(first).not.toBe(second)
  })

  test.each(['AB', 'ABCDEFGHJ', 'ABCU1234', '', 'AB_C1234'])(
    'returns null for the unusable code %p',
    async code => {
      expect(await identify('secret')(code)).toBeNull()
    }
  )
})

describe('codeIdentifier canonicalisation', () => {
  test('is stable across every rendering of the same code', async () => {
    const derive = identify('secret')
    const identifiers = await Promise.all(
      ['ABCD1234', 'abcd1234', 'ABCD-1234', 'ab cd 12 34'].map(derive)
    )

    expect(new Set(identifiers).size).toBe(1)
    expect(identifiers[0]).not.toBeNull()
  })

  test('treats the crockford aliases as their canonical digits', async () => {
    const derive = identify('secret', short)
    const [aliased, canonical] = await Promise.all([
      derive('ILO1'),
      derive('1101')
    ])

    expect(aliased).toBe(canonical)
    expect(aliased).not.toBeNull()
  })
})

describe('codeIdentifier subkey derivation', () => {
  test('keeps secrets isolated across instances', async () => {
    const secrets = ['a', 'b', 'c', 'a', 'b', 'c']
    const derivers = new Map(
      ['a', 'b', 'c'].map(secret => [secret, identify(secret)])
    )

    const identifiers = await Promise.all(
      secrets.map(secret => derivers.get(secret)?.('ABCD1234') ?? null)
    )

    expect(identifiers[0]).toBe(identifiers[3])
    expect(identifiers[1]).toBe(identifiers[4])
    expect(identifiers[2]).toBe(identifiers[5])
    expect(new Set(identifiers).size).toBe(3)

    for (const [index, secret] of secrets.entries()) {
      expect(identifiers[index]).toBe(reference(secret, 'ABCD1234'))
    }
  })

  test('derives the subkey once per instance', async () => {
    await countingImports(async imports => {
      const derive = identify('counted')

      await derive('ABCD1234')
      const afterFirst = imports()

      await derive('ZZZZ9999')

      expect(afterFirst).toBe(2)
      expect(imports()).toBe(afterFirst)
    })
  })

  test('derives nothing for an unusable code', async () => {
    await countingImports(async imports => {
      expect(await identify('unused')('AB')).toBeNull()
      expect(imports()).toBe(0)
    })
  })

  test('is usable concurrently for a fresh instance', async () => {
    const code = '012345'
    const derive = identify('concurrent', numeric)

    const identifiers = await Promise.all(
      Array.from({ length: 32 }, () => derive(code))
    )

    expect(new Set(identifiers).size).toBe(1)
    expect(identifiers[0]).toBe(reference('concurrent', code))
  })
})
