import { MAX_STORED_INTEGER } from '@/plugin/schema/tables'

import type { BetterAuthOptions } from 'better-auth/types'

const ID = {
  maxLength: 255,
  serial: /^[1-9]\d*$/,
  uuid: /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
} as const

export const isStoredId = (options: BetterAuthOptions, value: string) => {
  const mode = options.advanced?.database?.generateId

  if (mode === 'serial') {
    return ID.serial.test(value) && Number(value) <= MAX_STORED_INTEGER
  }
  if (mode === 'uuid') return ID.uuid.test(value)

  return value.length > 0 && value.length <= ID.maxLength
}
