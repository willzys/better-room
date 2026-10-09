import { describe, expect, test } from 'bun:test'

import { reconcile } from '@/core/operations/capacity/reconciliation'

import { EARLIER, LATER, NOW, membership } from '../../../../helpers/fixtures'

import type { Membership } from '@/core/membership'
import type { ReconciliationStore } from '@/core/operations/capacity/reconciliation'

const store = (
  owing: Membership[],
  claimed: (id: string) => boolean = () => true
): ReconciliationStore => ({
  owing: () => Promise.resolve(owing),
  endOccupancy: id => Promise.resolve(claimed(id)),
  lowerCount: () => Promise.resolve()
})

describe('reconcile', () => {
  test('names as lapsed only a membership its own deadline ended', async () => {
    const owing = [
      membership({ id: 'expired', expiresAt: EARLIER }),
      membership({ id: 'on-the-instant', expiresAt: NOW }),
      membership({ id: 'left', expiresAt: EARLIER, leftAt: EARLIER }),
      membership({ id: 'revoked', expiresAt: EARLIER, revokedAt: EARLIER }),
      membership({ id: 'still-ahead', expiresAt: LATER, leftAt: EARLIER })
    ]

    const reconciled = await reconcile({ now: NOW, batch: 10 }, store(owing))

    expect(reconciled.owing).toBe(5)
    expect(reconciled.released).toBe(5)
    expect(reconciled.lapsed.map(lapsed => lapsed.id)).toEqual([
      'expired',
      'on-the-instant'
    ])
  })

  test('names nothing it did not release itself', async () => {
    const owing = [
      membership({ id: 'taken', expiresAt: EARLIER }),
      membership({ id: 'claimed-elsewhere', expiresAt: EARLIER })
    ]

    const reconciled = await reconcile(
      { now: NOW, batch: 10 },
      store(owing, id => id === 'taken')
    )

    expect(reconciled.released).toBe(1)
    expect(reconciled.lapsed.map(lapsed => lapsed.id)).toEqual(['taken'])
  })
})
