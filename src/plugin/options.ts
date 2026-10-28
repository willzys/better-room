import { assertRoomHooks, isObject, signalling } from '@/plugin/hooks/events'
import { MAX_STORED_INTEGER } from '@/plugin/schema/tables'
import {
  CODE_FORMAT_NAMES,
  codeFormat,
  isCodeFormatName
} from '@/security/code-format'

import type { RoomHooks } from '@/plugin/hooks/events'
import type { RoomSchemaOption } from '@/plugin/schema/tables'
import type { CodeFormatName } from '@/security/code-format'

type Bound = {
  readonly name: string
  readonly unit: 'attempts' | 'seconds'
  readonly fallback: number
  readonly max: number
}

const DAY = 60 * 60 * 24

const BOUNDS = {
  grantLifetime: {
    name: 'grant lifetime',
    unit: 'seconds',
    fallback: 7 * DAY,
    max: 400 * DAY
  },
  grace: { name: 'grace window', unit: 'seconds', fallback: 120, max: DAY },
  attemptWindow: {
    name: 'attempt window',
    unit: 'seconds',
    fallback: 60,
    max: DAY
  },
  attemptsPerIp: {
    name: 'attempts per ip',
    unit: 'attempts',
    fallback: 10,
    max: MAX_STORED_INTEGER
  },
  attemptsForEveryone: {
    name: 'attempts for everyone',
    unit: 'attempts',
    fallback: 600,
    max: MAX_STORED_INTEGER
  }
} as const satisfies Record<string, Bound>

const boundedInteger = (value: unknown, bound: Bound) => {
  const resolved = value === undefined ? bound.fallback : value

  if (
    typeof resolved !== 'number' ||
    !Number.isInteger(resolved) ||
    resolved < 1
  ) {
    throw new RangeError(
      `${bound.name} must be a positive integer of ${bound.unit}`
    )
  }

  if (resolved > bound.max) {
    throw new RangeError(
      `${bound.name} must not exceed ${bound.max} ${bound.unit}`
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
  readonly join?: {
    readonly requireSession?: boolean
  }
  readonly attempts?: {
    readonly window?: number
    readonly perIp?: number
    readonly everyone?: number
  }
  readonly schema?: RoomSchemaOption
  readonly hooks?: RoomHooks
}

const groupOf = (value: unknown, name: string): Record<string, unknown> => {
  if (value === undefined) return {}
  if (!isObject(value)) throw new TypeError(`${name} must be an object`)

  return value
}

const limitsOf = (attempts: Record<string, unknown>) => {
  const window = boundedInteger(attempts.window, BOUNDS.attemptWindow)

  return {
    perIp: {
      window,
      max: boundedInteger(attempts.perIp, BOUNDS.attemptsPerIp)
    },
    everyone: {
      window,
      max: boundedInteger(attempts.everyone, BOUNDS.attemptsForEveryone)
    }
  }
}

const formatOf = (code: Record<string, unknown>) => {
  const name = code.format === undefined ? 'crockford' : code.format

  if (!isCodeFormatName(name)) {
    throw new TypeError(
      `code format must be one of ${CODE_FORMAT_NAMES.join(', ')}`
    )
  }
  if (code.length !== undefined && typeof code.length !== 'number') {
    throw new TypeError('room code length must be a number')
  }

  return codeFormat(name, code.length)
}

const flagOf = (value: unknown, name: string) => {
  if (value === undefined) return false
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean`)
  }

  return value
}

const signalOf = (options?: RoomOptions) => {
  if (options !== undefined && 'onChange' in options) {
    throw new TypeError('onChange was replaced by hooks.onEvent')
  }

  const hooks: unknown = options?.hooks

  if (hooks === undefined) return signalling()

  assertRoomHooks(hooks)

  return signalling(hooks)
}

export const settingsOf = (options?: RoomOptions) => {
  const given = groupOf(options, 'better-room options')
  const code = groupOf(given.code, 'code')

  return {
    format: formatOf(code),
    grace: boundedInteger(code.grace, BOUNDS.grace),
    grantLifetime: boundedInteger(
      groupOf(given.grant, 'grant').lifetime,
      BOUNDS.grantLifetime
    ),
    overHttp: flagOf(
      groupOf(given.creation, 'creation').overHttp,
      'creation over http'
    ),
    requireSession: flagOf(
      groupOf(given.join, 'join').requireSession,
      'join require session'
    ),
    signal: signalOf(options),
    ...limitsOf(groupOf(given.attempts, 'attempts'))
  }
}
