import { generate } from '@/security/code-format'

import type { Mint } from '@/core/room-code'
import type { CodeFormat } from '@/security/code-format'
import type { CodeIdentifier } from '@/security/code-identifier'

export const minter =
  (format: CodeFormat, identify: CodeIdentifier): Mint =>
  async () => {
    const code = generate(format)
    const identifier = await identify(code)

    return identifier === null ? null : { code, identifier }
  }
