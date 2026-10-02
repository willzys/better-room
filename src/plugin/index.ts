import type { BetterAuthPlugin } from 'better-auth/types'

import { ROOM_ERROR_CODES } from '@/plugin/errors'
import { joinEndpoint } from '@/plugin/join'
import type { RoomSchemaOption } from '@/plugin/schema'
import { createRoomSchema } from '@/plugin/schema'
import type { CodeFormatName } from '@/security/code-format'
import { codeFormat } from '@/security/code-format'
import type { CodeIdentifier } from '@/security/code-identifier'
import { codeIdentifier } from '@/security/code-identifier'

const DEFAULT_GRANT_LIFETIME = 60 * 60 * 24 * 7
const MAX_GRANT_LIFETIME = 60 * 60 * 24 * 400

const grantLifetimeOf = (lifetime: number | undefined) => {
  const resolved = lifetime ?? DEFAULT_GRANT_LIFETIME

  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new RangeError('grant lifetime must be a positive integer of seconds')
  }

  if (resolved > MAX_GRANT_LIFETIME) {
    throw new RangeError(
      `grant lifetime must not exceed ${MAX_GRANT_LIFETIME} seconds`
    )
  }

  return resolved
}

export type RoomOptions = {
  readonly code?: {
    readonly format?: CodeFormatName
    readonly length?: number
  }
  readonly grant?: {
    readonly lifetime?: number
  }
  readonly schema?: RoomSchemaOption
}

export const betterRoom = (options?: RoomOptions) => {
  const format = codeFormat(
    options?.code?.format ?? 'crockford',
    options?.code?.length
  )

  const grantLifetime = grantLifetimeOf(options?.grant?.lifetime)

  let identifier: CodeIdentifier | undefined

  return {
    id: 'better-room',
    endpoints: {
      joinRoom: joinEndpoint({
        identify: secret => (identifier ??= codeIdentifier({ format, secret })),
        grantLifetime
      })
    },
    schema: createRoomSchema(options?.schema),
    $ERROR_CODES: ROOM_ERROR_CODES
  } satisfies BetterAuthPlugin
}
