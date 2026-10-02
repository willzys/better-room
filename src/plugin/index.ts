import { accessEndpoint } from '@/plugin/endpoints/access'
import { addEndpoint } from '@/plugin/endpoints/add'
import { createEndpoint } from '@/plugin/endpoints/create'
import { joinEndpoint } from '@/plugin/endpoints/join'
import { leaveEndpoint } from '@/plugin/endpoints/leave'
import { lifecycleEndpoint } from '@/plugin/endpoints/lifecycle'
import { membershipsEndpoint } from '@/plugin/endpoints/memberships'
import { promoteEndpoint } from '@/plugin/endpoints/promote'
import { reconcileEndpoint } from '@/plugin/endpoints/reconcile'
import { revokeEndpoint } from '@/plugin/endpoints/revoke'
import { rotateEndpoint } from '@/plugin/endpoints/rotate'
import { ROOM_ERROR_CODES } from '@/plugin/errors'
import { createRoomSchema } from '@/plugin/schema'
import { codeFormat, generate } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

import type { BetterAuthPlugin } from 'better-auth/types'

import type { RoomSchemaOption } from '@/plugin/schema'
import type { CodeFormatName } from '@/security/code-format'
import type { CodeIdentifier } from '@/security/code-identifier'

const DEFAULT_GRANT_LIFETIME = 60 * 60 * 24 * 7
const DEFAULT_GRACE = 120
const DEFAULT_ATTEMPT_WINDOW = 60
const DEFAULT_ATTEMPTS_PER_IP = 10
const DEFAULT_ATTEMPTS_FOR_EVERYONE = 600
const MAX_GRANT_LIFETIME = 60 * 60 * 24 * 400
const MAX_GRACE = 60 * 60 * 24
const MAX_ATTEMPT_WINDOW = 60 * 60 * 24

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
    readonly grace?: number
  }
  readonly grant?: {
    readonly lifetime?: number
  }
  readonly creation?: {
    readonly overHttp?: boolean
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

  if (resolved > MAX_ATTEMPT_WINDOW) {
    throw new RangeError(
      `attempt window must not exceed ${MAX_ATTEMPT_WINDOW} seconds`
    )
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

const formatOf = (code: RoomOptions['code']) =>
  codeFormat(code?.format ?? 'crockford', code?.length)

const graceOf = (grace: number | undefined) => {
  const resolved = grace ?? DEFAULT_GRACE

  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new RangeError('grace window must be a positive integer of seconds')
  }

  if (resolved > MAX_GRACE) {
    throw new RangeError(`grace window must not exceed ${MAX_GRACE} seconds`)
  }

  return resolved
}

const settingsOf = (options?: RoomOptions) => ({
  format: formatOf(options?.code),
  grace: graceOf(options?.code?.grace),
  grantLifetime: grantLifetimeOf(options?.grant?.lifetime),
  overHttp: options?.creation?.overHttp ?? false,
  ...limitsOf(options?.attempts)
})

export const betterRoom = (options?: RoomOptions) => {
  const { format, grace, grantLifetime, overHttp, perIp, everyone } =
    settingsOf(options)

  let identifier: CodeIdentifier | undefined

  const identify = (secret: string) =>
    (identifier ??= codeIdentifier({ format, secret }))

  return {
    id: 'better-room',
    init: async context => {
      await identify(context.secret)(generate(format))
    },
    endpoints: {
      addRoomMember: addEndpoint(),
      getRoomAccess: accessEndpoint(),
      createRoom: createEndpoint({ format, identify, overHttp }),
      joinRoom: joinEndpoint({ identify, grantLifetime, perIp, everyone }),
      leaveRoom: leaveEndpoint(),
      listRoomMemberships: membershipsEndpoint(),
      promoteRoomActor: promoteEndpoint(),
      rotateRoomCode: rotateEndpoint({ format, identify, grace }),
      revokeRoomMember: revokeEndpoint(),
      lockRoom: lifecycleEndpoint('lock'),
      unlockRoom: lifecycleEndpoint('unlock'),
      closeRoom: lifecycleEndpoint('close'),
      reconcileRoomCapacity: reconcileEndpoint()
    },
    schema: createRoomSchema(options?.schema),
    $ERROR_CODES: ROOM_ERROR_CODES
  } satisfies BetterAuthPlugin
}
