import { describe, expect, test } from 'bun:test'

import { codeOf, jarOf } from '../../helpers/http'
import { departing, join, rows } from './harness'

import type { Auth, Harness } from './harness'

type Room = {
  readonly id: string
  readonly code: string
  readonly capacity: number
}

const trafficOf = (value: string | undefined) => {
  const traffic = Number(value ?? 36)

  if (!Number.isInteger(traffic) || traffic < 36) {
    throw new RangeError('ROOM_TRAFFIC must be an integer of at least 36')
  }

  return traffic
}

const TRAFFIC = trafficOf(process.env.ROOM_TRAFFIC)
const CALLERS = Math.floor(TRAFFIC / 3)
const UNDER_LOAD = TRAFFIC > 1000
const TIMEOUT = UNDER_LOAD ? 900_000 : 30_000

const share = (fraction: number) => Math.max(1, Math.floor(CALLERS * fraction))

const opened = async (auth: Auth, capacity: number): Promise<Room> => {
  const created = await auth.api.createRoom({ body: { maxMembers: capacity } })

  return { id: created.room.id, code: created.code, capacity }
}

const admittedOf = (responses: Response[]) =>
  responses.filter(response => response.status === 200)

const expectFull = async (responses: Response[]) => {
  const refused = responses.filter(response => response.status !== 200)

  expect(refused.map(response => response.status)).toEqual(
    refused.map(() => 409)
  )
  expect(await Promise.all(refused.map(codeOf))).toEqual(
    refused.map(() => 'ROOM_AT_CAPACITY')
  )
}

const expectLeft = (responses: Response[]) => {
  expect(responses.map(response => response.status)).toEqual(
    responses.map(() => 200)
  )
}

const holding = async (auth: Auth, room: Room) => {
  const occupying = (await rows(auth, 'roomMember')).filter(
    row => row.roomId === room.id && Number(row.occupancy) > 0
  )
  const counter = (await rows(auth, 'room')).find(row => row.id === room.id)
  const read = await auth.api.getRoomOccupancy({ query: { roomId: room.id } })

  expect(occupying.length).toBeLessThanOrEqual(room.capacity)
  expect(Number(counter?.memberCount)).toBe(occupying.length)
  expect(read.occupied).toBe(occupying.length)

  return occupying.length
}

const crowd = async (auth: Auth, room: Room) => {
  const arrivals = await Promise.all(
    Array.from({ length: CALLERS }, () => join(auth, room.code))
  )
  const admitted = admittedOf(arrivals)

  expect(admitted).toHaveLength(room.capacity)
  await expectFull(arrivals)
  expect(await holding(auth, room)).toBe(room.capacity)

  const holders = admitted.map(jarOf)
  const leavers = holders.slice(0, Math.ceil(room.capacity / 2))
  const staying = holders.slice(leavers.length)

  const churn = await Promise.all([
    ...leavers.map(cookie => departing(auth, room.id, cookie)),
    ...Array.from({ length: CALLERS - room.capacity }, () =>
      join(auth, room.code)
    )
  ])
  const departures = churn.slice(0, leavers.length)
  const replacements = admittedOf(churn.slice(leavers.length))

  expectLeft(departures)
  await expectFull(churn.slice(leavers.length))
  expect(replacements.length).toBeLessThanOrEqual(leavers.length)
  expect(await holding(auth, room)).toBe(staying.length + replacements.length)

  const present = [...staying, ...replacements.map(jarOf)]
  const swap = await Promise.all([
    ...present.map(cookie => departing(auth, room.id, cookie)),
    ...leavers.map(cookie => join(auth, room.code, cookie))
  ])
  const returned = admittedOf(swap.slice(present.length))

  expectLeft(swap.slice(0, present.length))
  await expectFull(swap.slice(present.length))
  expect(await holding(auth, room)).toBe(returned.length)

  expectLeft(
    await Promise.all(
      returned.map(response => departing(auth, room.id, jarOf(response)))
    )
  )
  expect(await holding(auth, room)).toBe(0)
}

const occupancyOf = (auth: Auth, rooms: Room[]) =>
  Promise.all(rooms.map(room => holding(auth, room)))

const joinedEach = async (auth: Auth, rooms: Room[], cookie: string) =>
  admittedOf(
    await Promise.all(rooms.map(room => join(auth, room.code, cookie)))
  )

const crowdsInWaves = async (auth: Auth) => {
  const rooms = await Promise.all([
    opened(auth, share(5 / 12)),
    opened(auth, share(3 / 12)),
    opened(auth, share(1 / 12))
  ])

  await Promise.all(rooms.map(room => crowd(auth, room)))

  const members = await rows(auth, 'roomMember')
  const counters = await rows(auth, 'room')

  expect(members.every(row => Number(row.occupancy) === 0)).toBe(true)
  expect(counters.map(row => Number(row.memberCount))).toEqual([0, 0, 0])
}

const hotRoom = async (auth: Auth) => {
  const room = await opened(auth, share(1 / 60))
  const arrivals = await Promise.all(
    Array.from({ length: TRAFFIC }, () => join(auth, room.code))
  )

  expect(admittedOf(arrivals)).toHaveLength(room.capacity)
  await expectFull(arrivals)
  expect(await holding(auth, room)).toBe(room.capacity)

  expectLeft(
    await Promise.all(
      admittedOf(arrivals).map(response =>
        departing(auth, room.id, jarOf(response))
      )
    )
  )
  expect(await holding(auth, room)).toBe(0)
}

const oneCallerManyRooms = async (auth: Auth) => {
  const rooms = await Promise.all(
    Array.from({ length: 4 }, () => opened(auth, 2))
  )
  const [first, ...others] = rooms
  if (first === undefined) throw new Error('Expected a first room')
  const cookie = jarOf(await join(auth, first.code))

  expect(await joinedEach(auth, others, cookie)).toHaveLength(others.length)
  expect(await occupancyOf(auth, rooms)).toEqual([1, 1, 1, 1])

  expectLeft(
    await Promise.all(rooms.map(room => departing(auth, room.id, cookie)))
  )
  expect(await occupancyOf(auth, rooms)).toEqual([0, 0, 0, 0])

  expect(await joinedEach(auth, rooms, cookie)).toHaveLength(rooms.length)
  expect(await occupancyOf(auth, rooms)).toEqual([1, 1, 1, 1])
  expect(await rows(auth, 'roomMember')).toHaveLength(rooms.length)
}

const collidingWithItself = async (auth: Auth) => {
  const room = await opened(auth, 2)
  const cookie = jarOf(await join(auth, room.code))

  await Promise.all([
    join(auth, room.code, cookie),
    departing(auth, room.id, cookie),
    join(auth, room.code, cookie),
    departing(auth, room.id, cookie),
    join(auth, room.code, cookie)
  ])

  const members = (await rows(auth, 'roomMember')).filter(
    row => row.roomId === room.id
  )
  const occupying = members.filter(row => Number(row.occupancy) > 0)
  const counter = (await rows(auth, 'room')).find(row => row.id === room.id)
  const seats = Number(counter?.memberCount)

  expect(members).toHaveLength(1)
  expect(occupying.length).toBeLessThanOrEqual(1)
  expect(seats).toBeGreaterThanOrEqual(occupying.length)
  expect(seats).toBeLessThanOrEqual(room.capacity)
}

export const trafficContract = ({ start }: Harness) => {
  describe('traffic across rooms over time', () => {
    test(
      `keeps every room within capacity while ${TRAFFIC} callers arrive, churn and leave in waves`,
      async () => {
        await crowdsInWaves(await start())
      },
      TIMEOUT
    )

    test(
      `admits exactly the capacity of one room ${TRAFFIC} callers reach at once`,
      async () => {
        await hotRoom(await start())
      },
      TIMEOUT
    )

    test('seats one caller in many rooms at once and frees them all at once', async () => {
      await oneCallerManyRooms(await start())
    })

    test('never seats an actor twice when its own joins and leaves collide', async () => {
      await collidingWithItself(await start())
    })
  })
}
