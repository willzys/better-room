import { describe, expect, test } from 'bun:test'

import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { betterRoom } from '@/plugin'

import { countingImports as counting } from '../../helpers/crypto'

import type { RoomOptions } from '@/plugin/options'

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

    expect(afterInit).toBe(4)
    expect(imports()).toBe(afterInit)
  })
})

const warningsFor = async (options: RoomOptions) => {
  const warnings: string[] = []
  const auth = betterAuth({
    secret: 'init-secret-long-enough-for-better-auth',
    baseURL: 'http://localhost:3000',
    database: memoryAdapter({}),
    logger: {
      log: (level, message) => {
        if (level === 'warn') warnings.push(message)
      }
    },
    plugins: [betterRoom(options)]
  })

  await auth.$context

  return warnings.filter(message => message.includes('distributed sweep'))
}

describe('warning about a code space a sweep can cover', () => {
  test('warns once for six digit codes anyone may present', async () => {
    expect(await warningsFor({ code: { format: 'numeric' } })).toHaveLength(1)
  })

  test.each([
    ['the default codes', {}],
    [
      'a session requirement',
      { code: { format: 'numeric' }, join: { requireSession: true } }
    ],
    ['twelve digit codes', { code: { format: 'numeric', length: 12 } }]
  ] as const)('stays silent for %s', async (_label, options) => {
    expect(await warningsFor(options)).toEqual([])
  })
})
