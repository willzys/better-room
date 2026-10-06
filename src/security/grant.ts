import type { Usable } from '@/types/absence'

const FORMAT = {
  version: 'v1',
  separator: '.',
  headerParts: 3,
  digits: /^\d+$/
} as const

export type Grant = {
  readonly actorId: string
  readonly epoch: number
  readonly expiresAt: number
}

const integer = (part: string | undefined): Usable<number> => {
  if (part === undefined || !FORMAT.digits.test(part)) return null

  const value = Number(part)

  return Number.isSafeInteger(value) ? value : null
}

export const encodeGrant = (grant: Grant) =>
  [FORMAT.version, grant.epoch, grant.expiresAt, grant.actorId].join(
    FORMAT.separator
  )

export const decodeGrant = (value: string): Usable<Grant> => {
  const parts = value.split(FORMAT.separator)

  if (parts[0] !== FORMAT.version) return null

  const epoch = integer(parts[1])
  const expiresAt = integer(parts[2])
  const actorId = parts.slice(FORMAT.headerParts).join(FORMAT.separator)

  if (epoch === null || expiresAt === null || actorId === '') return null

  return { actorId, epoch, expiresAt }
}

export const isLive = (grant: Grant, now: Date) =>
  grant.expiresAt > now.getTime()
