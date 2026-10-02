import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { resolveActor } from '@/core/actor'
import { addMember } from '@/core/addition'
import {
  additionError,
  additionServerOnlyError,
  oneIdentityError,
  unknownActorError
} from '@/plugin/errors'
import { actorStore, additionStore } from '@/plugin/store'

import type { Actor, ActorStore } from '@/core/actor'
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

export const addEndpoint = () =>
  createAuthEndpoint(
    '/room/add-member',
    { method: 'POST', body: addBody },
    async ctx => {
      if (ctx.request !== undefined) throw additionServerOnlyError()

      const identity = identityOf(ctx.body)

      if (identity === null) throw oneIdentityError()

      const { adapter } = ctx.context
      const actor = await actorFor(identity, actorStore(adapter))

      if (actor === null) throw unknownActorError()

      const outcome = await addMember(
        {
          roomId: ctx.body.roomId,
          actorId: actor.id,
          role: ctx.body.role,
          expiresAt: ctx.body.expiresAt ?? null,
          now: new Date()
        },
        additionStore(adapter)
      )

      if (!outcome.added) throw additionError(outcome.refusal)

      return ctx.json({ membership: outcome.membership })
    }
  )
