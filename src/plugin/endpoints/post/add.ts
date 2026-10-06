import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { resolveActor } from '@/core/actor'
import { addMember } from '@/core/operations/admission/addition'
import {
  additionError,
  additionIsServerOnlyError,
  exactlyOneIdentityError,
  unknownActorError
} from '@/plugin/errors/refusals'
import { isServerCall } from '@/plugin/http/carrier'
import { membershipReport } from '@/plugin/http/report'
import { additionStore } from '@/plugin/stores/admission/addition'
import { actorStore } from '@/plugin/stores/identity/actor'

import type { Actor, ActorStore } from '@/core/actor'
import type { Signal } from '@/plugin/hooks/events'
import type { Usable } from '@/types/absence'

const addBody = z.object({
  roomId: z.string().meta({ description: 'The room the member is added to' }),
  userId: z
    .string()
    .optional()
    .meta({ description: 'The user whose actor becomes a member' }),
  actorId: z
    .string()
    .optional()
    .meta({ description: 'An existing actor, as a membership reports it' }),
  role: z
    .string()
    .meta({ description: 'The role the membership carries, named by the app' }),
  expiresAt: z.coerce
    .date()
    .optional()
    .meta({ description: 'When the membership expires, never when absent' })
})

type Identity =
  | { readonly actorId: string; readonly kind: 'actor' }
  | { readonly kind: 'user'; readonly userId: string }

const identityOf = (body: {
  userId?: string | undefined
  actorId?: string | undefined
}): Usable<Identity> => {
  if (body.userId !== undefined && body.actorId === undefined) {
    return { kind: 'user', userId: body.userId }
  }

  if (body.actorId !== undefined && body.userId === undefined) {
    return { kind: 'actor', actorId: body.actorId }
  }

  return null
}

const actorFor = (
  identity: Identity,
  store: ActorStore
): Promise<Usable<Actor>> =>
  identity.kind === 'user'
    ? resolveActor({ userId: identity.userId, claim: null }, store)
    : store.byId(identity.actorId)

export const addEndpoint = (signal: Signal) =>
  createAuthEndpoint(
    '/better-room/add-member',
    { method: 'POST', body: addBody },
    async ctx => {
      if (!isServerCall(ctx)) throw additionIsServerOnlyError()

      const identity = identityOf(ctx.body)

      if (identity === null) throw exactlyOneIdentityError()

      const { adapter } = ctx.context
      const actor = await actorFor(identity, actorStore(adapter))

      if (actor === null) throw unknownActorError()

      const outcome = await addMember(
        {
          roomId: ctx.body.roomId,
          actor,
          role: ctx.body.role,
          expiresAt: ctx.body.expiresAt ?? null,
          now: new Date()
        },
        additionStore(adapter)
      )

      if (!outcome.added) throw additionError(outcome.refusal)

      const membership = membershipReport(outcome.membership)

      await signal(
        { type: 'added', roomId: membership.roomId, membership },
        ctx.context.logger
      )

      return ctx.json({ membership })
    }
  )
