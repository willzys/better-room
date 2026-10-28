import { describe, expect, test } from 'bun:test'

import { addressKey } from '../../helpers/crypto'
import { rows } from './harness'

import type { Auth, Harness } from './harness'

const FROM = '203.0.113.7'

const joining = (auth: Auth, code: string) =>
  auth.api.joinRoom({
    body: { code },
    headers: new Headers({ 'x-forwarded-for': FROM }),
    asResponse: true
  })

export const reservationContract = ({ start }: Harness) => {
  describe('reserving an attempt before the code resolves', () => {
    test('holds a simultaneous burst of guesses to the ceiling per address', async () => {
      const auth = await start({ attempts: { perIp: 3, reserve: true } })
      await auth.api.createRoom({ body: {} })

      const responses = await Promise.all(
        Array.from({ length: 20 }, () => joining(auth, 'ZZZZZZZZ'))
      )
      const statuses = responses.map(response => response.status)

      expect(
        statuses.filter(status => status === 400).length
      ).toBeLessThanOrEqual(3)
      expect(
        statuses.filter(status => status === 429).length
      ).toBeGreaterThanOrEqual(17)
    })

    test('returns the reservation of a code that resolved', async () => {
      const auth = await start({ attempts: { perIp: 3, reserve: true } })
      const created = await auth.api.createRoom({ body: {} })

      expect((await joining(auth, created.code)).status).toBe(200)

      const held = (await rows(auth, 'roomAttempt')).find(
        row => row.key === addressKey(FROM)
      )

      expect(Number(held?.count)).toBe(0)
    })
  })
}
