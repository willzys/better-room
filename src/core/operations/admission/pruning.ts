const PRUNING = { passes: 50, page: 200 } as const

export type PruningStore = {
  readonly expired: (before: Date, page: number) => Promise<string[]>
  readonly discard: (keys: string[], before: Date) => Promise<number>
}

export type PruningRequest = {
  readonly now: Date
  readonly window: number
}

export type Pruning = {
  readonly pruned: number
  readonly complete: boolean
}

type Sweep = {
  readonly store: PruningStore
  readonly before: Date
}

const pruning = async (
  sweep: Sweep,
  pruned: number,
  passes: number
): Promise<Pruning> => {
  const keys = await sweep.store.expired(sweep.before, PRUNING.page)

  if (keys.length === 0) return { pruned, complete: true }
  if (passes === 0) return { pruned, complete: false }

  const discarded = await sweep.store.discard(keys, sweep.before)

  return pruning(sweep, pruned + discarded, passes - 1)
}

export const pruneAttempts = (request: PruningRequest, store: PruningStore) =>
  pruning(
    {
      store,
      before: new Date(request.now.getTime() - request.window * 1000)
    },
    0,
    PRUNING.passes
  )
