import type { Where } from 'better-auth/types'

import type { RoomStatus } from '@/core/room'
import type {
  AttemptRow,
  CodeRow,
  MemberRow,
  RoomRow
} from '@/plugin/stores/rows'
import type { Unbounded, Unstarted } from '@/types/absence'

export type Clause<Row> = Omit<Where, 'field'> & {
  readonly field: Extract<keyof Row, string>
}

export const byId = (id: string): Clause<{ id: string }>[] => [
  { field: 'id', value: id }
]

export const byIdentifier = (identifier: string): Clause<CodeRow>[] => [
  { field: 'identifier', value: identifier }
]

export const byKey = (key: string): Clause<AttemptRow>[] => [
  { field: 'key', value: key }
]

export const beyond = <Row>(
  field: Extract<keyof Row, string>,
  cursor: Unstarted<string>
): Clause<Row>[] =>
  cursor === null ? [] : [{ field, operator: 'gt', value: cursor }]

export const OCCUPIED: Clause<MemberRow> = {
  field: 'occupancy',
  operator: 'gt',
  value: 0
}

const VACATED: Clause<MemberRow> = { field: 'occupancy', value: 0 }

export const SEATABLE: Clause<MemberRow>[] = [
  VACATED,
  { field: 'revokedAt', value: null }
]

export const UNRELEASED: Clause<MemberRow> = {
  field: 'releasedAt',
  value: null
}

export const pairing = (
  roomId: string,
  actorId: string
): Clause<MemberRow>[] => [
  { field: 'roomId', value: roomId },
  { field: 'actorId', value: actorId }
]

const below = (limit: Unbounded<number>): Clause<RoomRow>[] =>
  limit === null ? [] : [{ field: 'memberCount', operator: 'lt', value: limit }]

export const capacityGuard = (
  roomId: string,
  limit: Unbounded<number>,
  open: readonly RoomStatus[]
): Clause<RoomRow>[] => [
  ...byId(roomId),
  { field: 'status', operator: 'in', value: [...open] },
  ...below(limit)
]
