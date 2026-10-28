import { describe, expect, test } from 'bun:test'

import { minter } from '@/plugin/codes/mint'
import { codeFormat } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

const format = codeFormat('crockford')
const identify = codeIdentifier({ format, secret: 'mint-secret' })

describe('minting a code', () => {
  test('draws again while a code would shadow one stored under the old identifier', async () => {
    const seen: string[] = []
    const mint = minter(format, identify, identifier => {
      seen.push(identifier)

      return Promise.resolve(seen.length === 1)
    })

    const minted = await mint()
    const identifiers = minted === null ? null : await identify(minted.code)

    expect(seen).toHaveLength(2)
    expect(minted?.identifier).toBe(identifiers?.current)
  })

  test('gives up once every draw is shadowed', async () => {
    const mint = minter(format, identify, () => Promise.resolve(true))

    expect(await mint()).toBeNull()
  })
})
