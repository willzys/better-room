import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { rotateCode } from '@/core/rotation'
import { rotationError, rotationServerOnlyError } from '@/plugin/errors'
import { minter } from '@/plugin/mint'
import { rotationStore } from '@/plugin/store'

import type { CodeFormat } from '@/security/code-format'
import type { CodeIdentifier } from '@/security/code-identifier'

const rotateBody = z.object({
  roomId: z.string().meta({ description: 'The room whose code is replaced' })
})

type RotateDeps = {
  readonly format: CodeFormat
  readonly identify: (secret: string) => CodeIdentifier
  readonly grace: number
}

export const rotateEndpoint = (deps: RotateDeps) =>
  createAuthEndpoint(
    '/better-room/rotate-code',
    { method: 'POST', body: rotateBody },
    async ctx => {
      if (ctx.request !== undefined) throw rotationServerOnlyError()

      const { adapter, secret } = ctx.context

      const outcome = await rotateCode(
        {
          roomId: ctx.body.roomId,
          mint: minter(deps.format, deps.identify(secret)),
          grace: deps.grace,
          now: new Date()
        },
        rotationStore(adapter)
      )

      if (!outcome.rotated) throw rotationError(outcome.refusal)

      return ctx.json({ code: outcome.code })
    }
  )
