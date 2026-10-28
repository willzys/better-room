import { isObject, signalOf } from '@/plugin/hooks/events'
import { MAX_STORED_INTEGER } from '@/plugin/schema/tables'
import { codeFormatOf } from '@/security/code-format'

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
    readonly progressive?: boolean
    readonly reserve?: boolean
  }
  readonly schema?: RoomSchemaOption
  readonly hooks?: RoomHooks
}

type Grouped = { readonly root: RoomOptions } & {
  readonly [
    Group in 'code' | 'grant' | 'creation' | 'join' | 'attempts'
  ]-?: NonNullable<RoomOptions[Group]>
}

const GROUPS = {
  root: ['code', 'grant', 'creation', 'join', 'attempts', 'schema', 'hooks'],
  code: ['format', 'length', 'grace'],
  grant: ['lifetime'],
  creation: ['overHttp'],
  join: ['requireSession'],
  attempts: ['window', 'perIp', 'everyone', 'progressive', 'reserve']
} as const satisfies {
  readonly [Group in keyof Grouped]: readonly (keyof Grouped[Group])[]
}

const groupOf = (
  value: unknown,
  name: string,
  known: readonly string[]
): Record<string, unknown> => {
  if (value === undefined) return {}
  if (!isObject(value)) throw new TypeError(`${name} must be an object`)

  const stray = Object.keys(value).find(key => !known.includes(key))

  if (stray !== undefined) {
    throw new TypeError(
      `${name} has no option ${stray}; expected one of ${known.join(', ')}`
    )
  }

  return value
}

const limitsOf = (attempts: Record<string, unknown>) => {
  const window = boundedInteger(attempts.window, BOUNDS.attemptWindow)
  const perIp = boundedInteger(attempts.perIp, BOUNDS.attemptsPerIp)
  const everyone = boundedInteger(attempts.everyone, BOUNDS.attemptsForEveryone)

  if (attempts.perIp !== undefined && perIp > everyone) {
    throw new RangeError(
      `${BOUNDS.attemptsPerIp.name} must not exceed ${BOUNDS.attemptsForEveryone.name}`
    )
  }

  return {
    perIp: { window, max: perIp },
    everyone: { window, max: everyone },
    progressive: flagOf(attempts.progressive, 'attempts progressive'),
    reserve: flagOf(attempts.reserve, 'attempts reserve')
  }
}

const flagOf = (value: unknown, name: string) => {
  if (value === undefined) return false
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean`)
  }

  return value
}

const rootOf = (options: unknown) => {
  if (isObject(options) && 'onChange' in options) {
    throw new TypeError('onChange was replaced by hooks.onEvent')
  }

  return groupOf(options, 'better-room options', GROUPS.root)
}

export const settingsOf = (options?: RoomOptions) => {
  const given = rootOf(options)
  const code = groupOf(given.code, 'code', GROUPS.code)
  const join = groupOf(given.join, 'join', GROUPS.join)

  return {
    format: codeFormatOf(code.format, code.length),
    grace: boundedInteger(code.grace, BOUNDS.grace),
    grantLifetime: boundedInteger(
      groupOf(given.grant, 'grant', GROUPS.grant).lifetime,
      BOUNDS.grantLifetime
    ),
    overHttp: flagOf(
      groupOf(given.creation, 'creation', GROUPS.creation).overHttp,
      'creation over http'
    ),
    requireSession: flagOf(join.requireSession, 'join require session'),
    signal: signalOf(given.hooks),
    ...limitsOf(groupOf(given.attempts, 'attempts', GROUPS.attempts))
  }
}
