import { isRoomEventListener, signalling } from '@/plugin/hooks/events'
import { MAX_STORED_INTEGER } from '@/plugin/schema/tables'
import {
  CODE_FORMAT_NAMES,
  codeFormat,
  isCodeFormatName
} from '@/security/code-format'

import type { RoomEventListener } from '@/plugin/hooks/events'
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

const boundedInteger = (value: number | undefined, bound: Bound) => {
  const resolved = value ?? bound.fallback

  if (!Number.isInteger(resolved) || resolved < 1) {
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
  readonly onChange?: RoomEventListener
}

const limitsOf = (attempts: RoomOptions['attempts']) => {
  const window = boundedInteger(attempts?.window, BOUNDS.attemptWindow)

  return {
    perIp: {
      window,
      max: boundedInteger(attempts?.perIp, BOUNDS.attemptsPerIp)
    },
    everyone: {
      window,
      max: boundedInteger(attempts?.everyone, BOUNDS.attemptsForEveryone)
    }
  }
}

const formatOf = (code: RoomOptions['code']) => {
  const name: unknown = code?.format ?? 'crockford'

  if (!isCodeFormatName(name)) {
    throw new TypeError(
      `code format must be one of ${CODE_FORMAT_NAMES.join(', ')}`
    )
  }

  return codeFormat(name, code?.length)
}

const flagOf = (value: unknown, name: string) => {
  if (value === undefined) return false
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean`)
  }

  return value
}

const signalOf = (onChange: unknown) => {
  if (onChange === undefined) return signalling()
  if (!isRoomEventListener(onChange)) {
    throw new TypeError('onChange must be a function')
  }

  return signalling(onChange)
}

const flagsOf = (options?: RoomOptions) => ({
  overHttp: flagOf(options?.creation?.overHttp, 'creation over http'),
  requireSession: flagOf(options?.join?.requireSession, 'join require session')
})

export const settingsOf = (options?: RoomOptions) => ({
  format: formatOf(options?.code),
  grace: boundedInteger(options?.code?.grace, BOUNDS.grace),
  grantLifetime: boundedInteger(options?.grant?.lifetime, BOUNDS.grantLifetime),
  ...flagsOf(options),
  signal: signalOf(options?.onChange),
  ...limitsOf(options?.attempts)
})
