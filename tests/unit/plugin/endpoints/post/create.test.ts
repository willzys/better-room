import { describe, expect, test } from 'bun:test'

import { signedIn } from '../../../../helpers/auth'
import { codeOf, onlyRow, postRoute } from '../../../../helpers/http'
import { empty, memoryAuth } from '../../../../helpers/memory'

import type { RoomOptions } from '@/plugin/options'

const ENABLED: RoomOptions = { creation: { overHttp: true } }

const scenario = (room?: RoomOptions) => {
  const db = empty()
  const auth = memoryAuth(db, room)
  const create = (body: unknown, cookie?: string) =>
    postRoute(auth, 'create', body, cookie === undefined ? {} : { cookie })
  const host = () => signedIn(auth, 'host@example.com')

  return { db, create, host }
}

describe('creating a room over http', () => {
  test('is refused by default', async () => {
    const { db, create } = scenario()
    const response = await create({})

    expect(response.status).toBe(403)
    expect(await codeOf(response)).toBe('CREATION_IS_SERVER_ONLY')
    expect(db.room).toHaveLength(0)
  })

  test('refuses an anonymous caller even when it is enabled', async () => {
    const { db, create } = scenario(ENABLED)
    const response = await create({})

    expect(response.status).toBe(401)
    expect(await codeOf(response)).toBe('CREATION_NEEDS_A_SESSION')
    expect(db.room).toHaveLength(0)
  })

  test('admits an authenticated caller when it is enabled', async () => {
    const { db, create, host } = scenario(ENABLED)
    const response = await create({}, await host())

    expect(response.status).toBe(200)
    expect(db.room).toHaveLength(1)
    expect(onlyRow(db.roomActor).userId).toBe(onlyRow(db.user).id)
  })

  test('ignores a userId the caller tried to claim', async () => {
    const { db, create, host } = scenario(ENABLED)
    const response = await create({ userId: 'someone-else' }, await host())

    expect(response.status).toBe(200)
    expect(onlyRow(db.roomActor).userId).toBe(onlyRow(db.user).id)
  })
})

describe('creating a room refusing its seats', () => {
  test.each([0, -1, 1.5, 2_147_483_648])(
    'refuses %p seats before writing a room',
    async maxMembers => {
      const { db, create, host } = scenario(ENABLED)
      const response = await create({ maxMembers }, await host())

      expect(response.status).toBe(400)
      expect(await codeOf(response)).toBe('VALIDATION_ERROR')
      expect(db.room).toHaveLength(0)
    }
  )
})
