import { createAuthEndpoint } from 'better-auth/api'

import { retireCodes } from '@/core/operations/codes/retirement'
import { retirementReport } from '@/plugin/http/report'
import { retirementStore } from '@/plugin/stores/codes/retirement'

export const retireEndpoint = () =>
  createAuthEndpoint.serverOnly({ method: 'POST' }, async ctx => {
    const retired = await retireCodes(
      { now: new Date() },
      retirementStore(ctx.context.adapter)
    )

    return ctx.json(retirementReport(retired))
  })
