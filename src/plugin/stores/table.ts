import { MODELS } from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type {
  ActorInput,
  ActorRow,
  AttemptInput,
  AttemptRow,
  CodeInput,
  CodeRow,
  MemberInput,
  MemberRow,
  RoomInput,
  RoomRow,
  UserRow
} from '@/plugin/stores/rows'
import type { Clause } from '@/plugin/stores/where'

type Column<Row> = Exclude<Extract<keyof Row, string>, 'id'>

type NumericColumn<Row> = {
  [K in Column<Row>]-?: Row[K] extends number ? K : never
}[Column<Row>]

export type Changes<Row> = {
  readonly [K in Column<Row>]?: Row[K]
}

export type Increments<Row> = {
  readonly [K in NumericColumn<Row>]?: number
}

type Query<Row> = {
  readonly where: Clause<Row>[]
  readonly limit?: number
  readonly sortBy?: {
    readonly field: Extract<keyof Row, string>
    readonly direction: 'asc' | 'desc'
  }
}

type Change<Row> = {
  readonly where: Clause<Row>[]
  readonly set: Changes<Row>
}

type Increment<Row> = {
  readonly where: Clause<Row>[]
  readonly increment: Increments<Row>
  readonly set?: Changes<Row>
}

const counted = (increment: object): Record<string, number> => {
  const counts: Record<string, number> = {}

  for (const [field, by] of Object.entries(increment)) {
    if (typeof by === 'number') counts[field] = by
  }

  return counts
}

const table = <Row, Input extends Record<string, unknown>>(
  adapter: DBAdapter,
  model: string
) => ({
  findOne: (where: Clause<Row>[]) => adapter.findOne<Row>({ model, where }),
  findMany: (query: Query<Row>) => adapter.findMany<Row>({ model, ...query }),
  count: (where: Clause<Row>[]) => adapter.count({ model, where }),
  create: (data: Input) => adapter.create<Input, Row>({ model, data }),
  update: (change: Change<Row>) =>
    adapter.update<Row>({ model, where: change.where, update: change.set }),
  updateMany: (change: Change<Row>) =>
    adapter.updateMany({ model, where: change.where, update: change.set }),
  incrementOne: (change: Increment<Row>) =>
    adapter.incrementOne<Row>({
      model,
      where: change.where,
      increment: counted(change.increment),
      ...(change.set === undefined ? {} : { set: change.set })
    }),
  delete: (where: Clause<Row>[]) => adapter.delete({ model, where }),
  deleteMany: (where: Clause<Row>[]) => adapter.deleteMany({ model, where })
})

export const actorTable = (adapter: DBAdapter) =>
  table<ActorRow, ActorInput>(adapter, MODELS.actor)

export const roomTable = (adapter: DBAdapter) =>
  table<RoomRow, RoomInput>(adapter, MODELS.room)

export const codeTable = (adapter: DBAdapter) =>
  table<CodeRow, CodeInput>(adapter, MODELS.code)

export const memberTable = (adapter: DBAdapter) =>
  table<MemberRow, MemberInput>(adapter, MODELS.member)

export const attemptTable = (adapter: DBAdapter) =>
  table<AttemptRow, AttemptInput>(adapter, MODELS.attempt)

export const userTable = (adapter: DBAdapter) =>
  table<UserRow, Record<string, never>>(adapter, MODELS.user)
