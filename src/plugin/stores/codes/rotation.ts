import { codeStore } from '@/plugin/stores/codes/code'
import { roomLookup } from '@/plugin/stores/lookups'
import { codeTable } from '@/plugin/stores/table'
import { beyond } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { RotationStore } from '@/core/operations/codes/rotation'
import type { CodeRow } from '@/plugin/stores/rows'

const ACTIVE_CODES = { page: 100 } as const

const batches = (identifiers: string[]) =>
  Array.from(
    { length: Math.ceil(identifiers.length / ACTIVE_CODES.page) },
    (_, index) =>
      identifiers.slice(
        index * ACTIVE_CODES.page,
        (index + 1) * ACTIVE_CODES.page
      )
  )

export const rotationStore = (adapter: DBAdapter): RotationStore => {
  const codes = codeTable(adapter)

  const collectActive = async (
    roomId: string,
    collected: string[]
  ): Promise<string[]> => {
    const page = await codes.findMany({
      where: [
        { field: 'roomId', value: roomId },
        { field: 'status', value: 'active' },
        ...beyond<CodeRow>('identifier', collected.at(-1) ?? null)
      ],
      sortBy: { field: 'identifier', direction: 'asc' },
      limit: ACTIVE_CODES.page
    })
    const identifiers = [...collected, ...page.map(row => row.identifier)]
    return page.length < ACTIVE_CODES.page
      ? identifiers
      : collectActive(roomId, identifiers)
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
    until: Date
  ) => {
    await Promise.all(
      batches(identifiers).map(batch =>
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
    activeCodes: roomId => collectActive(roomId, []),
    demoteOthers
  }
}
