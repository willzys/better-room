import {
  jarOf,
  joinedMember,
  listedMemberships,
  stringField
} from '../../helpers/http'

import type { DBAdapter } from 'better-auth/types'

import type { RoomOptions } from '@/plugin/options'

import type { memoryAuth, Row, Table } from '../../helpers/memory'

export type Auth = {
  api: ReturnType<typeof memoryAuth>['api']
  $context: Promise<{
    adapter: Pick<
      DBAdapter,
      'create' | 'delete' | 'findMany' | 'incrementOne' | 'updateMany'
    >
  }>
}

export type Harness = {
  start: (options?: RoomOptions) => Promise<Auth>
  uniqueViolation: { code: string | number } | { cause: { code: string } }
}

export const rows = async (auth: Auth, model: Table) =>
  (await auth.$context).adapter.findMany<Row>({ model, limit: 1_000_000 })

export const listing = (auth: Auth, cookie?: string, before?: string) =>
  auth.api.listRoomMemberships({
    asResponse: true,
    ...(before === undefined ? {} : { query: { before } }),
    ...(cookie === undefined ? {} : { headers: new Headers({ cookie }) })
  })

export const held = async (auth: Auth, cookie?: string) =>
  (await listedMemberships(await listing(auth, cookie))).memberships

export const listedPage = async (auth: Auth, cookie?: string) =>
  listedMemberships(await listing(auth, cookie))

export const join = (auth: Auth, code: string, cookie?: string) =>
  auth.api.joinRoom({
    body: { code },
    asResponse: true,
    ...(cookie === undefined ? {} : { headers: new Headers({ cookie }) })
  })

export const departing = (auth: Auth, roomId: string, cookie?: string) =>
  auth.api.leaveRoom({
    body: { roomId },
    asResponse: true,
    ...(cookie === undefined ? {} : { headers: new Headers({ cookie }) })
  })

export const promoting = (auth: Auth, cookie: string) =>
  auth.api.promoteRoomActor({
    headers: new Headers({ cookie }),
    asResponse: true
  })

export const ledger = async (auth: Auth) => {
  const [rooms, members, actors] = await Promise.all([
    rows(auth, 'room'),
    rows(auth, 'roomMember'),
    rows(auth, 'roomActor')
  ])
  const known = new Set(actors.map(actor => actor.id))
  const occupying = (roomId: unknown) =>
    members.filter(row => row.roomId === roomId && row.occupancy === 1).length

  return {
    drifted: rooms.filter(room => room.memberCount !== occupying(room.id)),
    orphaned: members.filter(member => !known.has(member.actorId)),
    actors
  }
}

const seated = async (auth: Auth, actorId: string, expiresAt: Date | null) => {
  const { adapter } = await auth.$context
  const room = await adapter.create({
    model: 'room',
    data: { status: 'active', memberCount: 1, createdAt: new Date() }
  })
  const member = await adapter.create({
    model: 'roomMember',
    data: {
      roomId: stringField(room, 'id'),
      actorId,
      role: 'participant',
      joinedAt: new Date(),
      expiresAt
    }
  })

  return stringField(member, 'id')
}

export const holding = async (auth: Auth, perpetual: number, dated: number) => {
  const first = await auth.api.createRoom({ body: {} })
  const joined = await join(auth, first.code)
  const cookie = jarOf(joined)
  const { actorId, id } = await joinedMember(joined)
  const until = new Date(Date.now() + 3_600_000)
  const seating = (count: number, expiresAt: Date | null) =>
    Promise.all(
      Array.from({ length: count }, () => seated(auth, actorId, expiresAt))
    )
  const [open, expiring] = await Promise.all([
    seating(perpetual - 1, null),
    seating(dated, until)
  ])

  return { cookie, perpetual: [id, ...open], dated: expiring }
}

const paging = async (
  auth: Auth,
  cookie: string,
  before: string | undefined,
  pages: string[][]
): Promise<string[][]> => {
  const page = await listedMemberships(await listing(auth, cookie, before))
  const gathered = [
    ...pages,
    page.memberships.map(entry => entry.membership.id)
  ]

  return page.next === null
    ? gathered
    : paging(auth, cookie, page.next, gathered)
}

export const walkedListing = (auth: Auth, cookie: string) =>
  paging(auth, cookie, undefined, [])
