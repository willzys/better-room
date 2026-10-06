import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { rotateCode } from '@/core/operations/codes/rotation'
import { minter } from '@/plugin/codes/mint'
import {
  rotationError,
  rotationIsServerOnlyError
} from '@/plugin/errors/refusals'
import { isServerCall } from '@/plugin/http/carrier'
import { rotationStore } from '@/plugin/stores/codes/rotation'

import type { Signal } from '@/plugin/hooks/events'
import type { CodeFormat } from '@/security/code-format'
import type { CodeIdentifier } from '@/security/code-identifier'

const rotateBody = z.object({
  roomId: z.string().meta({ description: 'The room whose code is replaced' })
})

type RotateDeps = {
  readonly format: CodeFormat
  readonly identify: (secret: string) => CodeIdentifier
  readonly grace: number
  readonly signal: Signal
}

export const rotateEndpoint = (deps: RotateDeps) =>
  createAuthEndpoint(
    '/better-room/rotate-code',
    { method: 'POST', body: rotateBody },
    async ctx => {
      if (!isServerCall(ctx)) throw rotationIsServerOnlyError()

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

      await deps.signal(
        { type: 'rotated', roomId: ctx.body.roomId },
        ctx.context.logger
      )

      return ctx.json({ code: outcome.code })
    }
  )
