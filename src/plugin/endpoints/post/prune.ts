import { createAuthEndpoint } from 'better-auth/api'

import { pruneAttempts } from '@/core/operations/admission/pruning'
import { pruningReport } from '@/plugin/http/report'
import { pruningStore } from '@/plugin/stores/admission/pruning'

export const pruneEndpoint = (window: number) =>
  createAuthEndpoint.serverOnly({ method: 'POST' }, async ctx => {
    const pruned = await pruneAttempts(
      { now: new Date(), window },
      pruningStore(ctx.context.adapter)
    )

    return ctx.json(pruningReport(pruned))
  })
