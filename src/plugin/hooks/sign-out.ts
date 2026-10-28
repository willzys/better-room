import { createAuthMiddleware } from 'better-auth/api'
import { expireCookie } from 'better-auth/cookies'

import { GRANT_COOKIE } from '@/plugin/http/carrier'

export const signOutHooks = () => ({
  after: [
    {
      matcher: (context: { path?: string }) => context.path === '/sign-out',
      handler: createAuthMiddleware(async ctx => {
        expireCookie(ctx, ctx.context.createAuthCookie(GRANT_COOKIE))
      })
    }
  ]
})
