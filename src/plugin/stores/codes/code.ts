import { writeOrConfirm } from '@/plugin/stores/collision'
import { codeTable } from '@/plugin/stores/table'
import { byIdentifier } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

export const codeStore = (adapter: DBAdapter) => {
  const codes = codeTable(adapter)

  const issueCode = (
    identifier: string,
    roomId: string,
    at: Date,
    replacing: readonly string[]
  ) =>
    writeOrConfirm(
      async () => {
        await codes.create({
          identifier,
          roomId,
          status: 'active',
          createdAt: at
        })

        return true
      },
      async () => {
        const taken = await codes.findOne(byIdentifier(identifier))

        if (taken === null) return null

        return (
          taken.roomId === roomId &&
          taken.status === 'active' &&
          !replacing.includes(identifier)
        )
      }
    )

  return { issueCode }
}
