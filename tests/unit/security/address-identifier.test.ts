import { describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'

import { addressIdentifier } from '@/security/address-identifier'
import { codeFormat } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

const reference = (secret: string, address: string) =>
  createHmac(
    'sha256',
    createHmac('sha256', secret).update('better-room:address:v1').digest()
  )
    .update(address)
    .digest('hex')

describe('addressIdentifier', () => {
  test('matches the reference and never carries the address', async () => {
    const identifier = await addressIdentifier('secret')('203.0.113.7')

    expect(identifier).toBe(reference('secret', '203.0.113.7'))
    expect(identifier).not.toContain('203')
  })

  test('changes with the secret', async () => {
    expect(await addressIdentifier('first')('203.0.113.7')).not.toBe(
      await addressIdentifier('second')('203.0.113.7')
    )
  })

  test('is separated from the code identifier under one secret', async () => {
    const numeric = codeFormat('numeric', 6)

    expect(await addressIdentifier('secret')('123456')).not.toBe(
      (await codeIdentifier({ format: numeric, secret: 'secret' })('123456'))
        ?.current
    )
  })
})
