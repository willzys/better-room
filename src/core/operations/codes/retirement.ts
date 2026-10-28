const RETIREMENT = { passes: 50, page: 200 } as const

export type RetirementStore = {
  readonly spent: (now: Date, page: number) => Promise<string[]>
  readonly discard: (ids: string[]) => Promise<number>
}

export type RetirementRequest = {
  readonly now: Date
}

export type Retirement = {
  readonly retired: number
  readonly complete: boolean
}

const retiring = async (
  request: RetirementRequest,
  store: RetirementStore,
  retired: number,
  passes: number
): Promise<Retirement> => {
  const ids = await store.spent(request.now, RETIREMENT.page)

  if (ids.length === 0) return { retired, complete: true }
  if (passes === 0) return { retired, complete: false }

  const discarded = await store.discard(ids)

  return retiring(request, store, retired + discarded, passes - 1)
}

export const retireCodes = (
  request: RetirementRequest,
  store: RetirementStore
) => retiring(request, store, 0, RETIREMENT.passes)
