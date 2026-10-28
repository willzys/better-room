import { normalize } from '@/security/code-format'
import { keyedDigest } from '@/security/keyed-digest'

import type { CodeFormat } from '@/security/code-format'
import type { Usable } from '@/types/absence'

const CODE_KEY_LABELS = {
  current: 'better-room:code:v2',
  legacy: 'better-room:code:v1'
} as const

export type CodeIdentifiers = {
  readonly current: string
  readonly legacy: string
}

export type CodeIdentifier = (code: string) => Promise<Usable<CodeIdentifiers>>

export const codeIdentifier = (options: {
  format: CodeFormat
  secret: string
}): CodeIdentifier => {
  const current = keyedDigest(options.secret, CODE_KEY_LABELS.current)
  const legacy = keyedDigest(options.secret, CODE_KEY_LABELS.legacy)

  return async code => {
    const canonical = normalize(code, options.format)

    if (canonical === null) return null

    const [scoped, unscoped] = await Promise.all([
      current(`${options.format.name}:${canonical}`),
      legacy(canonical)
    ])

    return { current: scoped, legacy: unscoped }
  }
}
