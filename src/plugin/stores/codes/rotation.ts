import { codeIssuer } from '@/plugin/stores/codes/code'
import { byId, found, MODELS, toRoom } from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type { RotationStore } from '@/core/operations/codes/rotation'
import type { CodeRow, RoomRow } from '@/plugin/stores/rows'

const ACTIVE_CODE_PAGE = 100
const ACTIVE_CODE_CEILING = 1000

const collectActive = async (
  adapter: DBAdapter,
  roomId: string,
  collected: string[]
): Promise<string[]> => {
  const last = collected.at(-1)
  const page = await adapter.findMany<CodeRow>({
    model: MODELS.code,
    where: [
      { field: 'roomId', value: roomId },
      { field: 'status', value: 'active' },
      ...(last === undefined
        ? []
        : [{ field: 'identifier', operator: 'gt' as const, value: last }])
    ],
    sortBy: { field: 'identifier', direction: 'asc' },
    limit: ACTIVE_CODE_PAGE
  })
  const identifiers = [...collected, ...page.map(row => row.identifier)]

  return page.length < ACTIVE_CODE_PAGE ||
    identifiers.length >= ACTIVE_CODE_CEILING
    ? identifiers
    : collectActive(adapter, roomId, identifiers)
}

export const rotationStore = (adapter: DBAdapter): RotationStore => ({
  ...codeIssuer(adapter),
  room: async id =>
    found(
      await adapter.findOne<RoomRow>({ model: MODELS.room, where: byId(id) }),
      toRoom
    ),
  retireGrace: async (roomId, at) => {
    await adapter.updateMany({
      model: MODELS.code,
      where: [
        { field: 'roomId', value: roomId },
        { field: 'status', value: 'grace' }
      ],
      update: { status: 'revoked', revokedAt: at }
    })
  },
  activeCodes: roomId => collectActive(adapter, roomId, []),
  demoteOthers: async (roomId, codeIds, until) => {
    await adapter.updateMany({
      model: MODELS.code,
      where: [
        { field: 'roomId', value: roomId },
        { field: 'status', value: 'active' },
        { field: 'identifier', operator: 'in', value: codeIds }
      ],
      update: { status: 'grace', expiresAt: until }
    })
  }
})
