import { hasLapsed } from '@/core/membership'
import { release } from '@/core/operations/capacity/release'

import type { Membership } from '@/core/membership'
import type { ReleaseStore } from '@/core/operations/capacity/release'

export type ReconciliationStore = ReleaseStore & {
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
  const settled = await Promise.all(
    owing.map(membership => release(membership, request.now, store, 'none'))
  )

  return {
    owing: owing.length,
    released: settled.filter(Boolean).length,
    lapsed: owing.filter(
      (membership, index) =>
        settled[index] && hasLapsed(membership, request.now)
    )
  }
}
