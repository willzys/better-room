import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { reconcile } from '@/core/operations/capacity/reconciliation'
import { reconciliationIsServerOnlyError } from '@/plugin/errors/refusals'
import { isServerCall } from '@/plugin/http/carrier'
import { reconciliationReport } from '@/plugin/http/report'
import { reconciliationStore } from '@/plugin/stores/capacity/reconciliation'

const BATCH = { fallback: 200, max: 1000 } as const

const reconcileBody = z.object({
  batch: z
    .number()
    .int()
    .positive()
    .max(BATCH.max)
    .optional()
    .meta({ description: 'How many memberships one run may settle' })
})

export const reconcileEndpoint = () =>
  createAuthEndpoint(
    '/better-room/reconcile',
    { method: 'POST', body: reconcileBody },
    async ctx => {
      if (!isServerCall(ctx)) throw reconciliationIsServerOnlyError()

      const reconciled = await reconcile(
        { now: new Date(), batch: ctx.body.batch ?? BATCH.fallback },
        reconciliationStore(ctx.context.adapter)
      )

      return ctx.json(reconciliationReport(reconciled))
    }
  )
