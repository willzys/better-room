import type { Usable } from '@/types/absence'

const VERSION = 'v1'
const SEPARATOR = '.'
const HEADER_PARTS = 3
const DIGITS = /^\d+$/

export type Grant = {
  readonly actorId: string
  readonly epoch: number
  readonly expiresAt: number
}

const integer = (part: string | undefined): Usable<number> => {
  if (part === undefined || !DIGITS.test(part)) return null

  const value = Number(part)

  return Number.isSafeInteger(value) ? value : null
}

export const encodeGrant = (grant: Grant) =>
  [VERSION, grant.epoch, grant.expiresAt, grant.actorId].join(SEPARATOR)

export const decodeGrant = (value: string): Usable<Grant> => {
  const parts = value.split(SEPARATOR)

  if (parts[0] !== VERSION) return null

  const epoch = integer(parts[1])
  const expiresAt = integer(parts[2])
  const actorId = parts.slice(HEADER_PARTS).join(SEPARATOR)

  if (epoch === null || expiresAt === null || actorId === '') return null

  return { actorId, epoch, expiresAt }
}

export const isLive = (grant: Grant, now: Date) =>
  grant.expiresAt > now.getTime()
