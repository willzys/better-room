import type { Usable } from '@/types/absence'

const MIN_LENGTH = 1
const MAX_LENGTH = 64
const MAX_INPUT_LENGTH = 1024

const SEPARATORS = /[\s-]+/g

type FormatSpec = {
  readonly symbols: string
  readonly defaultLength: number
  readonly aliases: Readonly<Record<string, string>>
}

export type CodeFormatName = 'crockford' | 'numeric'

export type CodeFormat = {
  readonly symbols: string
  readonly length: number
  readonly canonicalize: (input: string) => Usable<string>
}

const BUILT_IN: Record<CodeFormatName, FormatSpec> = {
  crockford: {
    symbols: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
    defaultLength: 8,
    aliases: { I: '1', L: '1', O: '0' }
  },
  numeric: {
    symbols: '0123456789',
    defaultLength: 6,
    aliases: {}
  }
}

const foldingOf = (spec: FormatSpec) => {
  const folding = new Map<string, string>()

  for (const symbol of spec.symbols) {
    folding.set(symbol, symbol)
    folding.set(symbol.toLowerCase(), symbol)
  }

  for (const [alias, symbol] of Object.entries(spec.aliases)) {
    folding.set(alias, symbol)
    folding.set(alias.toLowerCase(), symbol)
  }

  return folding
}

const canonicalizerOf = (spec: FormatSpec) => {
  const folding = foldingOf(spec)

  return (input: string): Usable<string> => {
    let canonical = ''

    for (const character of input.replace(SEPARATORS, '')) {
      const symbol = folding.get(character)

      if (symbol === undefined) return null

      canonical += symbol
    }

    return canonical
  }
}

export const codeFormat = (
  name: CodeFormatName,
  length?: number
): CodeFormat => {
  const spec = BUILT_IN[name]
  const resolved = length ?? spec.defaultLength

  if (
    !Number.isInteger(resolved) ||
    resolved < MIN_LENGTH ||
    resolved > MAX_LENGTH
  ) {
    throw new RangeError(
      `room code length must be an integer between ${MIN_LENGTH} and ${MAX_LENGTH}`
    )
  }

  return {
    symbols: spec.symbols,
    length: resolved,
    canonicalize: canonicalizerOf(spec)
  }
}

export const normalize = (
  input: string,
  format: CodeFormat
): Usable<string> => {
  if (input.length > MAX_INPUT_LENGTH) return null

  const canonical = format.canonicalize(input)

  return canonical?.length === format.length ? canonical : null
}

export const generate = (format: CodeFormat) => {
  const { symbols, length } = format
  const unbiasedLimit = Math.floor(256 / symbols.length) * symbols.length
  const buffer = new Uint8Array(length)

  let code = ''

  while (code.length < length) {
    crypto.getRandomValues(buffer)

    for (const byte of buffer) {
      if (byte < unbiasedLimit) code += symbols.charAt(byte % symbols.length)
      if (code.length === length) break
    }
  }

  return code
}
