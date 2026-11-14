import { describe, expect, test } from 'bun:test'

import { rows } from './harness'

import type { Auth, Harness } from './harness'

const budget = async (auth: Auth, key: string, lastAttemptAt: Date) => {
  const { adapter } = await auth.$context
  await adapter.create({
    model: 'roomAttempt',
    data: { key, count: 3, lastAttemptAt }
  })
}

export const pruningContract = ({ start }: Harness) => {
  describe('pruning the attempt budgets a window left behind', () => {
    test('removes every budget past its window and keeps the live ones', async () => {
      const auth = await start({})
      const stale = new Date(Date.now() - 2 * 60 * 60 * 1000)
      const keys = Array.from({ length: 250 }, (_, index) => `ip:${index}`)

      await Promise.all(keys.map(key => budget(auth, key, stale)))
      await budget(auth, 'global', new Date())

      expect(await auth.api.pruneRoomAttempts()).toEqual({
        pruned: 250,
        complete: true
      })
      expect((await rows(auth, 'roomAttempt')).map(row => row.key)).toEqual([
        'global'
      ])
    })
  })
}
