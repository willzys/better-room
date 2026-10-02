import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api'
import * as z from 'zod'

import { resolveActor } from '@/core/actor'
import { createRoom } from '@/core/creation'
import {
  exhaustedError,
  serverOnlyError,
  unauthenticatedError
} from '@/plugin/errors'
import { minter } from '@/plugin/mint'
import { actorStore, creationStore } from '@/plugin/store'

import type { CodeFormat } from '@/security/code-format'
import type { CodeIdentifier } from '@/security/code-identifier'
import type { Unlinked } from '@/types/absence'

const createBody = z.object({
  userId: z.string().optional().meta({
    description: 'The user the room is created for, server side only'
  }),
  maxMembers: z
    .number()
    .int()
    .positive()
    .optional()
    .meta({ description: 'The seats the room admits, unbounded when absent' }),
  expiresAt: z.coerce
    .date()
    .optional()
    .meta({ description: 'When the room expires, never when absent' })
})

type CreateDeps = {
  readonly format: CodeFormat
  readonly identify: (secret: string) => CodeIdentifier
  readonly overHttp: boolean
}

export const createEndpoint = (deps: CreateDeps) =>
  createAuthEndpoint(
    '/better-room/create',
    { method: 'POST', body: createBody },
    async ctx => {
      const { adapter, secret } = ctx.context
      let createdBy: Unlinked<string> = null

      if (ctx.request === undefined) {
        createdBy = ctx.body.userId ?? null
      } else {
        if (!deps.overHttp) throw serverOnlyError()

        const session = await getSessionFromCtx(ctx)

        if (session === null) throw unauthenticatedError()

        createdBy = session.user.id
      }

      const actor =
        createdBy === null
          ? null
          : await resolveActor(
              { userId: createdBy, claim: null },
              actorStore(adapter)
            )

      const created = await createRoom(
        {
          createdBy: actor === null ? null : actor.id,
          maxMembers: ctx.body.maxMembers ?? null,
          expiresAt: ctx.body.expiresAt ?? null,
          mint: minter(deps.format, deps.identify(secret)),
          now: new Date()
        },
        creationStore(adapter)
      )

      if (created === null) throw exhaustedError()

      return ctx.json({ room: created.room, code: created.code })
    }
  )
