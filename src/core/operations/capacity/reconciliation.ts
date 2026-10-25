import { hasLapsed } from '@/core/membership'
import { reclaim } from '@/core/operations/capacity/release'

import type { Membership } from '@/core/membership'
import type { ReclaimStore } from '@/core/operations/capacity/release'

export type ReconciliationStore = ReclaimStore & {
  readonly owing: (now: Date, batch: number) => Promise<Membership[]>
}

export type ReconciliationRequest = {
  readonly now: Date
  readonly batch: number
}

export type Reconciliation = {
  readonly owing: number
  readonly released: number
  readonly lapsed: readonly Membership[]
}

export const reconcile = async (
  request: ReconciliationRequest,
  store: ReconciliationStore
): Promise<Reconciliation> => {
  const owing = await store.owing(request.now, request.batch)
  const reclaimed = await Promise.all(
    owing.map(membership => reclaim(membership, request.now, store))
  )
  const taken = reclaimed.filter(membership => membership !== null)

  return {
    owing: owing.length,
    released: taken.length,
    lapsed: taken.filter(membership => hasLapsed(membership, request.now))
  }
}
