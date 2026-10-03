import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { reconcile } from '@/core/operations/capacity/reconciliation'
import { reconciliationServerOnlyError } from '@/plugin/errors'
import { reconciliationStore } from '@/plugin/stores/capacity/reconciliation'

const DEFAULT_BATCH = 200
const MAX_BATCH = 1000

const reconcileBody = z.object({
  batch: z
    .number()
    .int()
    .positive()
    .max(MAX_BATCH)
    .optional()
    .meta({ description: 'How many memberships one run may settle' })
})

export const reconcileEndpoint = () =>
  createAuthEndpoint(
    '/better-room/reconcile',
    { method: 'POST', body: reconcileBody },
    async ctx => {
      if (ctx.request !== undefined) throw reconciliationServerOnlyError()

      return ctx.json(
        await reconcile(
          { now: new Date(), batch: ctx.body.batch ?? DEFAULT_BATCH },
          reconciliationStore(ctx.context.adapter)
        )
      )
    }
  )
