import { describe, expect, test } from 'bun:test'

import { signedIn } from '../../../helpers/auth'
import { jarOf } from '../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../helpers/memory'

const grantOf = (response: Response) =>
  response.headers.getSetCookie().find(cookie => cookie.includes('room_grant'))

describe('signing out', () => {
  test('expires the room grant the browser carried', async () => {
    const db = empty()
    const code = await seedRoom(db)
    const auth = memoryAuth(db)
    const grant = jarOf(
      await auth.api.joinRoom({ body: { code }, asResponse: true })
    )
    const session = await signedIn(auth, 'first@example.com')

    const response = await auth.api.signOut({
      headers: new Headers({ cookie: `${grant}; ${session}` }),
      asResponse: true
    })

    expect(response.status).toBe(200)
    expect(grantOf(response)).toContain('Max-Age=0')
  })

  test('sets no grant on any other route', async () => {
    const auth = memoryAuth(empty())
    const response = await auth.api.signUpEmail({
      body: {
        email: 'second@example.com',
        password: 'password-long-enough',
        name: 'Second'
      },
      asResponse: true
    })

    expect(grantOf(response)).toBeUndefined()
  })
})
