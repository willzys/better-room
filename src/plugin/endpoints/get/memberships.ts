import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api'
import * as z from 'zod'

import { findActor } from '@/core/actor'
import { readMemberships } from '@/core/operations/reads/memberships'
import { carriersOf, GRANT_COOKIE } from '@/plugin/carrier'
import {
  membershipReport,
  readResumption,
  resumptionReport,
  roomReport
} from '@/plugin/report'
import { actorStore } from '@/plugin/stores/identity/actor'
import { membershipsStore } from '@/plugin/stores/reads/memberships'

const membershipsQuery = z
  .object({
    before: z
      .string()
      .transform((text, issues) => {
        const resumption = readResumption(text)

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
      const { adapter, secret } = ctx.context
      const cookie = ctx.context.createAuthCookie(GRANT_COOKIE)

      const [signed, session] = await Promise.all([
        ctx.getSignedCookie(cookie.name, secret),
        getSessionFromCtx(ctx)
      ])

      const actor = await findActor(
        carriersOf(signed, session, now),
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
        next: resumptionReport(listed.next)
      })
    }
  )
