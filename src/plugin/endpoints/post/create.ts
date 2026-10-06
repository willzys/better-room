import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api'
import * as z from 'zod'

import { resolveActor } from '@/core/actor'
import { createRoom } from '@/core/operations/rooms/creation'
import { minter } from '@/plugin/codes/mint'
import {
  codeSpaceExhaustedError,
  creationIsServerOnlyError,
  creationNeedsASessionError
} from '@/plugin/errors/refusals'
import { isServerCall } from '@/plugin/http/carrier'
import { roomReport } from '@/plugin/http/report'
import { MAX_STORED_INTEGER } from '@/plugin/schema/tables'
import { actorStore } from '@/plugin/stores/identity/actor'
import { creationStore } from '@/plugin/stores/rooms/creation'

import type { GenericEndpointContext } from '@better-auth/core'

import type { ActorStore } from '@/core/actor'
import type { Signal } from '@/plugin/hooks/events'
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
    .max(MAX_STORED_INTEGER)
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
  readonly signal: Signal
}

const creatorOf = async (
  ctx: GenericEndpointContext,
  requested: Unlinked<string>,
  overHttp: boolean
): Promise<Unlinked<string>> => {
  if (isServerCall(ctx)) return requested
  if (!overHttp) throw creationIsServerOnlyError()

  const session = await getSessionFromCtx(ctx)

  if (session === null) throw creationNeedsASessionError()

  return session.user.id
}

const actorIdOf = async (userId: string, store: ActorStore) =>
  (await resolveActor({ userId, claim: null }, store)).id

export const createEndpoint = (deps: CreateDeps) =>
  createAuthEndpoint(
    '/better-room/create',
    { method: 'POST', body: createBody },
    async ctx => {
      const { adapter, secret } = ctx.context
      const creator = await creatorOf(
        ctx,
        ctx.body.userId ?? null,
        deps.overHttp
      )

      const createdBy =
        creator === null ? null : await actorIdOf(creator, actorStore(adapter))

      const created = await createRoom(
        {
          createdBy,
          maxMembers: ctx.body.maxMembers ?? null,
          expiresAt: ctx.body.expiresAt ?? null,
          mint: minter(deps.format, deps.identify(secret)),
          now: new Date()
        },
        creationStore(adapter)
      )

      if (created === null) throw codeSpaceExhaustedError()

      const room = roomReport(created.room)

      await deps.signal(
        { type: 'created', roomId: room.id, room },
        ctx.context.logger
      )

      return ctx.json({ room, code: created.code })
    }
  )
