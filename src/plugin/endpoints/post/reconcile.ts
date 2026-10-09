import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { reconcile } from '@/core/operations/capacity/reconciliation'
import { membershipReport, reconciliationReport } from '@/plugin/http/report'
import { reconciliationStore } from '@/plugin/stores/capacity/reconciliation'

import type { Signal } from '@/plugin/hooks/events'

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

export const reconcileEndpoint = (signal: Signal) =>
  createAuthEndpoint.serverOnly(
    { method: 'POST', body: reconcileBody },
    async ctx => {
      const reconciled = await reconcile(
        { now: new Date(), batch: ctx.body.batch ?? BATCH.fallback },
        reconciliationStore(ctx.context.adapter)
      )

      await Promise.all(
        reconciled.lapsed.map(lapsed => {
          const membership = membershipReport(lapsed)

          return signal(
            { type: 'expired', roomId: membership.roomId, membership },
            ctx.context.logger
          )
        })
      )

      return ctx.json(reconciliationReport(reconciled))
    }
  )
