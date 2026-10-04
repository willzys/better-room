import { byIdentifier, MODELS } from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type { CodeRow, Input } from '@/plugin/stores/rows'

export const codeIssuer = (adapter: DBAdapter) => ({
  issueCode: async (
    identifier: string,
    roomId: string,
    at: Date,
    replacing: readonly string[]
  ) => {
    try {
      await adapter.create<Input, CodeRow>({
        model: MODELS.code,
        data: { identifier, roomId, status: 'active', createdAt: at }
      })

      return true
    } catch (error) {
      const taken = await adapter.findOne<CodeRow>({
        model: MODELS.code,
        where: byIdentifier(identifier)
      })

      if (taken === null) throw error

      return (
        taken.roomId === roomId &&
        taken.status === 'active' &&
        !replacing.includes(identifier)
      )
    }
  }
})
