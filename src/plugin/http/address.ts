import { getIP } from 'better-auth/api'

import type { BetterAuthOptions } from 'better-auth/types'

import type { KeyedDigest } from '@/security/keyed-digest'

export const addressOf = async (
  carrier: Headers | Request | undefined,
  options: BetterAuthOptions,
  locate: KeyedDigest
) => {
  const ip = carrier === undefined ? null : getIP(carrier, options)

  return ip === null ? null : locate(ip)
}
