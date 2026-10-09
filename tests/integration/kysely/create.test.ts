import { describe, expect, test } from 'bun:test'

import { signedIn } from '../../helpers/auth'
import { codeOf, onlyRow, stringField } from '../../helpers/http'
import { sqliteFixture } from '../../helpers/sqlite'

const fixture = sqliteFixture()
const { auth, rows } = fixture

const signUp = () => signedIn(auth(), 'host@example.com')

describe('creating a room through auth.api', () => {
  test('carries the seats and the expiry it was given', async () => {
    const expiresAt = new Date(Date.now() + 3600_000)
    const created = await auth().api.createRoom({
      body: { maxMembers: 3, expiresAt }
    })

    expect(created.room.maxMembers).toBe(3)
    expect(created.room.expiresAt).toEqual(expiresAt)
  })

  test('links the room to the actor of the user it was created for', async () => {
    await signUp()
    const userId = stringField(onlyRow(rows('user')), 'id')
    const created = await auth().api.createRoom({ body: { userId } })

    const actor = onlyRow(rows('roomActor'))
    expect(actor.userId).toBe(userId)
    const actorId = stringField(actor, 'id')
    expect(created.room.createdBy).toBe(actorId)
  })
})

describe('creating a room at the storage bound', () => {
  test('accepts the largest count a PostgreSQL integer stores', async () => {
    const created = await auth().api.createRoom({
      body: { maxMembers: 2_147_483_647 }
    })

    expect(created.room.maxMembers).toBe(2_147_483_647)
  })
})

describe('creating a room when the code space runs out', () => {
  test('leaves no room behind for a creation it refused', async () => {
    const instance = auth({ code: { format: 'numeric', length: 1 } })
    const responses = await Array.from({ length: 20 }).reduce<
      Promise<Response[]>
    >(
      async earlier => [
        ...(await earlier),
        await instance.api.createRoom({ body: {}, asResponse: true })
      ],
      Promise.resolve([])
    )
    const refused = responses.filter(response => response.status !== 200)
    const coded = new Set(rows('roomCode').map(code => code.roomId))

    expect(refused.length).toBeGreaterThan(0)
    expect(await Promise.all(refused.map(codeOf))).toEqual(
      refused.map(() => 'CODE_SPACE_EXHAUSTED')
    )
    expect(rows('room')).toHaveLength(responses.length - refused.length)
    expect(rows('room').every(room => coded.has(room.id))).toBe(true)
  })
})
