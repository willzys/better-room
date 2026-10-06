import { normalize } from '@/security/code-format'

import type { CodeFormat } from '@/security/code-format'
import type { Usable } from '@/types/absence'

const HMAC = {
  keyLabel: 'better-room:code:v1',
  algorithm: { name: 'HMAC', hash: 'SHA-256' },
  hexSymbols: '0123456789abcdef'
} as const

const encoder = new TextEncoder()

const importKey = (material: Uint8Array<ArrayBuffer>) =>
  crypto.subtle.importKey('raw', material, HMAC.algorithm, false, ['sign'])

const sign = async (key: CryptoKey, message: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await crypto.subtle.sign(HMAC.algorithm, key, message))

const deriveSubkey = async (secret: string) => {
  const secretKey = await importKey(encoder.encode(secret))

  return importKey(await sign(secretKey, encoder.encode(HMAC.keyLabel)))
}

const toHex = (bytes: Uint8Array) => {
  let hex = ''

  for (const byte of bytes) {
    hex +=
      HMAC.hexSymbols.charAt(byte >> 4) + HMAC.hexSymbols.charAt(byte & 0b1111)
  }

  return hex
}

export type CodeIdentifier = (code: string) => Promise<Usable<string>>

export const codeIdentifier = (options: {
  format: CodeFormat
  secret: string
}): CodeIdentifier => {
  let subkey: Promise<CryptoKey> | undefined

  return async code => {
    const canonical = normalize(code, options.format)

    if (canonical === null) return null

    subkey ??= deriveSubkey(options.secret)

    return toHex(await sign(await subkey, encoder.encode(canonical)))
  }
}
