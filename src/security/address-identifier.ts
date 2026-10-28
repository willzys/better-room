import { keyedDigest } from '@/security/keyed-digest'

import type { KeyedDigest } from '@/security/keyed-digest'

const ADDRESS_KEY_LABEL = 'better-room:address:v1'

export const addressIdentifier = (secret: string): KeyedDigest =>
  keyedDigest(secret, ADDRESS_KEY_LABEL)
