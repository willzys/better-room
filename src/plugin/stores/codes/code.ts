import { byId, MODELS } from '@/plugin/stores/rows'

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
        data: { id: identifier, roomId, status: 'active', createdAt: at },
        forceAllowId: true
      })

      return true
    } catch (error) {
      const taken = await adapter.findOne<CodeRow>({
        model: MODELS.code,
        where: byId(identifier)
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
