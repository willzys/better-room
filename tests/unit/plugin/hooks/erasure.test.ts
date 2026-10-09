import { describe, expect, test } from 'bun:test'

import { SECRET, signedIn } from '../../../helpers/auth'
import { membership, room } from '../../../helpers/fixtures'
import { joinedMember, onlyRow, stringField } from '../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../helpers/memory'

import type { Tables } from '../../../helpers/memory'

const DRAIN_PAGE = 200

const joined = async (
  auth: ReturnType<typeof memoryAuth>,
  code: string,
  cookie: string
) =>
  joinedMember(
    await auth.api.joinRoom({
      body: { code },
      headers: new Headers({ cookie }),
      asResponse: true
    })
  )

const erasing = async (
  db: Tables,
  email: string,
  databaseHooks?: Parameters<typeof memoryAuth>[3]
) => {
  const code = await seedRoom(db, { room: { maxMembers: 1 } })
  const auth = memoryAuth(db, undefined, SECRET, databaseHooks)
  const cookie = await signedIn(auth, email)
  const member = await joined(auth, code, cookie)

  return { auth, cookie, member }
}

const deleting = (auth: ReturnType<typeof memoryAuth>, cookie: string) =>
  auth.api.deleteUser({
    body: {},
    headers: new Headers({ cookie }),
    asResponse: true
  })

describe('erasing the actor a deleted user owned', () => {
  test('returns the seat its membership occupied', async () => {
    const db = empty()
    const { auth, cookie, member } = await erasing(db, 'erased@example.com')

    expect(onlyRow(db.room).memberCount).toBe(1)
    expect(stringField(onlyRow(db.roomActor), 'id')).toBe(member.actorId)

    expect((await deleting(auth, cookie)).status).toBe(200)
    expect(db.roomMember).toHaveLength(0)
    expect(db.roomActor).toHaveLength(0)
    expect(onlyRow(db.room).memberCount).toBe(0)
    expect(onlyRow(db.room).status).toBe('active')
  })

  test('leaves the membership another actor holds in the same room', async () => {
    const db = empty()
    const code = await seedRoom(db, { room: { maxMembers: 2 } })
    const auth = memoryAuth(db)
    const cookie = await signedIn(auth, 'linked@example.com')
    const linked = await joined(auth, code, cookie)
    const other = await joinedMember(
      await auth.api.joinRoom({ body: { code }, asResponse: true })
    )

    expect(onlyRow(db.room).memberCount).toBe(2)

    await deleting(auth, cookie)

    expect(db.roomMember.map(held => held.id)).toEqual([other.id])
    expect(db.roomActor.map(held => held.id)).toEqual([other.actorId])
    expect(other.actorId).not.toBe(linked.actorId)
    expect(onlyRow(db.room).memberCount).toBe(1)
  })

  test('drains more memberships than one read can hold', async () => {
    const db = empty()
    const { auth, cookie, member } = await erasing(db, 'crowded@example.com')

    for (let index = 0; index < DRAIN_PAGE; index++) {
      const roomId = `beyond-room-${index}`
      db.room.push(room({ id: roomId, memberCount: 1 }))
      db.roomMember.push({
        ...membership({
          id: `beyond-member-${index}`,
          roomId,
          actorId: member.actorId
        }),
        occupancy: 1,
        releasedAt: null
      })
    }

    expect(db.roomMember).toHaveLength(DRAIN_PAGE + 1)

    await deleting(auth, cookie)

    expect(db.roomMember).toHaveLength(0)
    expect(db.roomActor).toHaveLength(0)
    expect(db.room.map(seat => seat.memberCount)).toEqual(db.room.map(() => 0))
  })
})

describe('what a user deletion leaves behind', () => {
  test('keeps the room its actor opened and forgets the provenance', async () => {
    const db = empty()
    const { auth, cookie, member } = await erasing(db, 'opener@example.com')
    const userId = stringField(onlyRow(db.user), 'id')
    const opened = await auth.api.createRoom({ body: { userId } })

    expect(opened.room.createdBy).toBe(member.actorId)

    await deleting(auth, cookie)

    const survivor = db.room.find(seat => seat.id === opened.room.id)

    expect(survivor?.status).toBe('active')
    expect(survivor?.createdBy).toBeNull()
  })

  test('keeps the actor a vetoed deletion never erased', async () => {
    const db = empty()
    const { auth, cookie, member } = await erasing(db, 'vetoed@example.com', {
      user: { delete: { before: () => Promise.resolve(false) } }
    })

    await deleting(auth, cookie)

    expect(db.user).toHaveLength(1)
    expect(stringField(onlyRow(db.roomActor), 'id')).toBe(member.actorId)
    expect(stringField(onlyRow(db.roomMember), 'id')).toBe(member.id)
    expect(onlyRow(db.roomMember).occupancy).toBe(1)
    expect(onlyRow(db.room).memberCount).toBe(1)
  })
})
