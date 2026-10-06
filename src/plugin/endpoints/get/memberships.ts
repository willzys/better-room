import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { findActor } from '@/core/actor'
import { readMemberships } from '@/core/operations/reads/memberships'
import { carriersFrom } from '@/plugin/http/carrier'
import { readCursor, writeCursor } from '@/plugin/http/cursor'
import { membershipReport, roomReport } from '@/plugin/http/report'
import { actorStore } from '@/plugin/stores/identity/actor'
import { membershipsStore } from '@/plugin/stores/reads/memberships'

const membershipsQuery = z
  .object({
    before: z
      .string()
      .transform((text, issues) => {
        const resumption = readCursor(text)

        if (resumption === null) {
          issues.addIssue({
            code: 'custom',
            message: 'Unreadable listing cursor'
          })

          return z.NEVER
        }

        return resumption
      })
      .optional()
      .meta({
        description: 'Continue a partial listing from the next it returned'
      })
  })
  .optional()

export const membershipsEndpoint = () =>
  createAuthEndpoint(
    '/better-room/memberships',
    { method: 'GET', query: membershipsQuery },
    async ctx => {
      const now = new Date()
      const { adapter } = ctx.context
      const actor = await findActor(
        await carriersFrom(ctx, now),
        actorStore(adapter)
      )

      const listed = await readMemberships(
        { actor, now, before: ctx.query?.before ?? null },
        membershipsStore(adapter)
      )

      return ctx.json({
        memberships: listed.held.map(entry => ({
          membership: membershipReport(entry.membership),
          room: roomReport(entry.room)
        })),
        complete: listed.complete,
        next: writeCursor(listed.next)
      })
    }
  )
