import { ROOM_ERROR_CODES } from '@/plugin/errors'
import { joinEndpoint } from '@/plugin/join'
import { createRoomSchema } from '@/plugin/schema'
import { codeFormat } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

import type { BetterAuthPlugin } from 'better-auth/types'

import type { RoomSchemaOption } from '@/plugin/schema'
import type { CodeFormatName } from '@/security/code-format'
import type { CodeIdentifier } from '@/security/code-identifier'

const DEFAULT_GRANT_LIFETIME = 60 * 60 * 24 * 7
const DEFAULT_ATTEMPT_WINDOW = 60
const DEFAULT_ATTEMPTS_PER_IP = 10
const DEFAULT_ATTEMPTS_FOR_EVERYONE = 600
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
  readonly attempts?: {
    readonly window?: number
    readonly perIp?: number
    readonly everyone?: number
  }
  readonly schema?: RoomSchemaOption
}

const ceilingOf = (name: string, max: number | undefined, fallback: number) => {
  const resolved = max ?? fallback

  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new RangeError(`${name} must be a positive integer of attempts`)
  }

  return resolved
}

const attemptWindowOf = (window: number | undefined) => {
  const resolved = window ?? DEFAULT_ATTEMPT_WINDOW

  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new RangeError('attempt window must be a positive integer of seconds')
  }

  return resolved
}

const limitsOf = (attempts: RoomOptions['attempts']) => {
  const window = attemptWindowOf(attempts?.window)

  return {
    perIp: {
      window,
      max: ceilingOf(
        'attempts per ip',
        attempts?.perIp,
        DEFAULT_ATTEMPTS_PER_IP
      )
    },
    everyone: {
      window,
      max: ceilingOf(
        'attempts for everyone',
        attempts?.everyone,
        DEFAULT_ATTEMPTS_FOR_EVERYONE
      )
    }
  }
}

export const betterRoom = (options?: RoomOptions) => {
  const format = codeFormat(
    options?.code?.format ?? 'crockford',
    options?.code?.length
  )

  const grantLifetime = grantLifetimeOf(options?.grant?.lifetime)
  const { perIp, everyone } = limitsOf(options?.attempts)

  let identifier: CodeIdentifier | undefined

  return {
    id: 'better-room',
    endpoints: {
      joinRoom: joinEndpoint({
        identify: secret => (identifier ??= codeIdentifier({ format, secret })),
        grantLifetime,
        perIp,
        everyone
      })
    },
    schema: createRoomSchema(options?.schema),
    $ERROR_CODES: ROOM_ERROR_CODES
  } satisfies BetterAuthPlugin
}
