import { describe, expect, test } from 'bun:test'

import * as z from 'zod'

import { signedIn } from '../../helpers/auth'
import { jarOf } from '../../helpers/http'

import type { Auth, Harness } from './harness'

const member = z.object({
  name: z.string().nullable(),
  anonymous: z.boolean()
})

const listed = z.object({ members: z.array(member), complete: z.boolean() })

const joining = (auth: Auth, code: string, cookie?: string, name?: string) =>
  auth.api.joinRoom({
    body: name === undefined ? { code } : { code, name },
    asResponse: true,
    ...(cookie === undefined ? {} : { headers: new Headers({ cookie }) })
  })

const roster = async (auth: Auth, roomId: string, cookie?: string) => {
  const response = await auth.api.listRoomMembers({
    query: { roomId },
    asResponse: true,
    ...(cookie === undefined ? {} : { headers: new Headers({ cookie }) })
  })

  return { response, read: () => response.clone().json() }
}

const names = async (auth: Auth, roomId: string, cookie: string) => {
  const { read } = await roster(auth, roomId, cookie)
  const page = listed.parse(await read())

  return page.members.map(({ name, anonymous }) => ({ name, anonymous }))
}

export const membersContract = ({ start }: Harness) => {
  describe('listing who holds a room', () => {
    test('names an anonymous member by its own name and a user by the account', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const roomId = created.room.id
      const guest = jarOf(await joining(auth, created.code, undefined, ' Ana '))
      const user = await signedIn(auth, 'member@example.com')

      await joining(auth, created.code, user)

      expect(
        new Set((await names(auth, roomId, guest)).map(entry => entry.name))
      ).toEqual(new Set(['Ana', 'Someone']))

      const fromServer = await roster(auth, roomId)

      expect(listed.parse(await fromServer.read()).members).toHaveLength(2)
    })

    test('shows the name a member gives itself, and the account again once it clears it', async () => {
      const auth = await start()
      const created = await auth.api.createRoom({ body: {} })
      const roomId = created.room.id
      const user = await signedIn(auth, 'renamed@example.com')
      const rename = (name: string | null) =>
        auth.api.renameRoomMember({
          body: { roomId, name },
          headers: new Headers({ cookie: user })
        })

      await joining(auth, created.code, user)
      await rename('Capitã')

      expect(await names(auth, roomId, user)).toEqual([
        { name: 'Capitã', anonymous: false }
      ])

      await rename(null)

      expect(await names(auth, roomId, user)).toEqual([
        { name: 'Someone', anonymous: false }
      ])
    })
  })
}
