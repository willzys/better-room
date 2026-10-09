import { expect, test } from 'bun:test'

import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { betterRoom } from '@/plugin'

import { countingImports as counting } from '../../helpers/crypto'

test('derives the code subkey while the context initialises', async () => {
  await counting(async imports => {
    const auth = betterAuth({
      secret: 'init-secret-long-enough-for-better-auth',
      baseURL: 'http://localhost:3000',
      database: memoryAdapter({ roomAttempt: [], roomCode: [] }),
      plugins: [betterRoom()]
    })

    await auth.$context

    const afterInit = imports()

    await auth.api.joinRoom({ body: { code: 'ABCD1234' }, asResponse: true })

    expect(afterInit).toBe(2)
    expect(imports()).toBe(afterInit)
  })
})
