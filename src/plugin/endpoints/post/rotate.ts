import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { rotateCode } from '@/core/operations/codes/rotation'
import { minter } from '@/plugin/codes/mint'
import { rotationError } from '@/plugin/errors/refusals'
import { isStoredId } from '@/plugin/http/identifiers'
import { codeStore } from '@/plugin/stores/codes/code'
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
  createAuthEndpoint.serverOnly(
    { method: 'POST', body: rotateBody },
    async ctx => {
      const { adapter, secret, options } = ctx.context

      if (!isStoredId(options, ctx.body.roomId)) {
        throw rotationError('unknown-room')
      }

      const outcome = await rotateCode(
        {
          roomId: ctx.body.roomId,
          mint: minter(
            deps.format,
            deps.identify(secret),
            codeStore(adapter).taken
          ),
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
