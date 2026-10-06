import { EXPIRY_BRANCHES } from '@/core/operations/reads/memberships'

import type {
  ExpiryBranch,
  Resumption
} from '@/core/operations/reads/memberships'
import type { Exhausted, Resumable } from '@/types/absence'

const BRANCH_TAGS = {
  perpetual: 'p',
  dated: 'd'
} as const satisfies Record<ExpiryBranch, string>

export const writeCursor = (
  resumption: Exhausted<Resumption>
): Exhausted<string> =>
  resumption === null
    ? null
    : `${BRANCH_TAGS[resumption.branch]}.${resumption.after ?? ''}`

export const readCursor = (text: string): Resumable<Resumption> => {
  const branch = EXPIRY_BRANCHES.find(name =>
    text.startsWith(`${BRANCH_TAGS[name]}.`)
  )

  if (branch === undefined) return null

  const after = text.slice(BRANCH_TAGS[branch].length + 1)

  return { branch, after: after === '' ? null : after }
}
