import * as z from 'zod'

import type { Usable } from '@/types/absence'

const NAME = {
  maxLength: 48,
  hidden: /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/u,
  spaces: /\p{Zs}+/gu
} as const

export const readDisplayName = (input: string): Usable<string> => {
  const composed = input.normalize('NFC')

  if (NAME.hidden.test(composed)) return null

  const name = composed.replaceAll(NAME.spaces, ' ').trim()
  const length = [...name].length

  return length === 0 || length > NAME.maxLength ? null : name
}

export const displayNameField = z.string().transform((text, issues) => {
  const name = readDisplayName(text)

  if (name === null) {
    issues.addIssue({
      code: 'custom',
      message: `A display name is 1 to ${NAME.maxLength} visible characters`
    })

    return z.NEVER
  }

  return name
})
