import { generate } from '@/security/code-format'

import type { Mint, Minted } from '@/core/room-code'
import type { CodeFormat } from '@/security/code-format'
import type { CodeIdentifier } from '@/security/code-identifier'
import type { Usable } from '@/types/absence'

const DRAW_ATTEMPTS = 5

type Taken = (identifier: string) => Promise<boolean>

const drawing = async (
  format: CodeFormat,
  identify: CodeIdentifier,
  taken: Taken,
  attempts: number
): Promise<Usable<Minted>> => {
  if (attempts === 0) return null

  const code = generate(format)
  const identifiers = await identify(code)

  if (identifiers === null) return null

  const shadowed = await taken(identifiers.legacy)

  if (shadowed) return drawing(format, identify, taken, attempts - 1)

  return { code, identifier: identifiers.current }
}

export const minter =
  (format: CodeFormat, identify: CodeIdentifier, taken: Taken): Mint =>
  () =>
    drawing(format, identify, taken, DRAW_ATTEMPTS)
