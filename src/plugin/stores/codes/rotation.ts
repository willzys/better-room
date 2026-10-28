import { codeStore } from '@/plugin/stores/codes/code'
import { roomLookup } from '@/plugin/stores/lookups'
import { codeTable } from '@/plugin/stores/table'
import { beyond } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { RotationStore } from '@/core/operations/codes/rotation'
import type { CodeRow } from '@/plugin/stores/rows'

const batches = (identifiers: string[], page: number) =>
  Array.from({ length: Math.ceil(identifiers.length / page) }, (_, index) =>
    identifiers.slice(index * page, (index + 1) * page)
  )

export const rotationStore = (adapter: DBAdapter): RotationStore => {
  const codes = codeTable(adapter)

  const collectActive = async (
    roomId: string,
    page: number,
    collected: string[]
  ): Promise<string[]> => {
    const found = await codes.findMany({
      where: [
        { field: 'roomId', value: roomId },
        { field: 'status', value: 'active' },
        ...beyond<CodeRow>('identifier', collected.at(-1) ?? null)
      ],
      sortBy: { field: 'identifier', direction: 'asc' },
      limit: page
    })
    const identifiers = [...collected, ...found.map(row => row.identifier)]
    return found.length < page
      ? identifiers
      : collectActive(roomId, page, identifiers)
  }

  const retireGrace = async (roomId: string, at: Date) => {
    await codes.updateMany({
      where: [
        { field: 'roomId', value: roomId },
        { field: 'status', value: 'grace' }
      ],
      set: { status: 'revoked', revokedAt: at }
    })
  }

  const demoteOthers = async (
    roomId: string,
    identifiers: string[],
    until: Date,
    page: number
  ) => {
    await Promise.all(
      batches(identifiers, page).map(batch =>
        codes.updateMany({
          where: [
            { field: 'roomId', value: roomId },
            { field: 'status', value: 'active' },
            { field: 'identifier', operator: 'in', value: batch }
          ],
          set: { status: 'grace', expiresAt: until }
        })
      )
    )
  }

  return {
    ...codeStore(adapter),
    room: roomLookup(adapter),
    retireGrace,
    activeCodes: (roomId, page) => collectActive(roomId, page, []),
    demoteOthers
  }
}
