const HMAC = {
  algorithm: { name: 'HMAC', hash: 'SHA-256' },
  hexSymbols: '0123456789abcdef'
} as const

const encoder = new TextEncoder()

const importKey = (material: Uint8Array<ArrayBuffer>) =>
  crypto.subtle.importKey('raw', material, HMAC.algorithm, false, ['sign'])

const sign = async (key: CryptoKey, message: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await crypto.subtle.sign(HMAC.algorithm, key, message))

const deriveSubkey = async (secret: string, label: string) => {
  const secretKey = await importKey(encoder.encode(secret))

  return importKey(await sign(secretKey, encoder.encode(label)))
}

const toHex = (bytes: Uint8Array) => {
  let hex = ''

  for (const byte of bytes) {
    hex +=
      HMAC.hexSymbols.charAt(byte >> 4) + HMAC.hexSymbols.charAt(byte & 0b1111)
  }

  return hex
}

export type KeyedDigest = (message: string) => Promise<string>

export const keyedDigest = (secret: string, label: string): KeyedDigest => {
  let subkey: Promise<CryptoKey> | undefined

  return async message => {
    subkey ??= deriveSubkey(secret, label)

    return toHex(await sign(await subkey, encoder.encode(message)))
  }
}
