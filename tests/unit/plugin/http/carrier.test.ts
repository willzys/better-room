import { describe, expect, test } from 'bun:test'

import { codeFormat, generate } from '@/security/code-format'

import { SECRET, signedIn } from '../../../helpers/auth'
import { codeOf, jarOf, joinedMember, onlyRow } from '../../../helpers/http'
import {
  empty,
  memoryAuth,
  seedRoom as seedFixture
} from '../../../helpers/memory'

import type { Tables } from '../../../helpers/memory'

const format = codeFormat('crockford')

const instance = (db: Tables, secret = SECRET) =>
  memoryAuth(db, undefined, secret)

const seed = (db: Tables, code: string, secret = SECRET) =>
  seedFixture(db, { plaintext: code, secret })

const signUp = (db: Tables) => signedIn(instance(db), 'someone@example.com')

describe('carrier precedence', () => {
  test('resolves an authenticated caller to a linked actor and no grant', async () => {
    const db = empty()
    const code = generate(format)
    await seed(db, code)
    const session = await signUp(db)

    const response = await instance(db).api.joinRoom({
      body: { code },
      headers: new Headers({ cookie: session }),
      asResponse: true
    })

    expect(response.status).toBe(200)
    expect(db.roomActor).toHaveLength(1)
    expect(db.roomActor[0]?.userId).toBe(onlyRow(db.user).id)
    expect(response.headers.get('set-cookie') ?? '').not.toContain('room_grant')
  })

  test('lets the session win when a grant arrives with it', async () => {
    const db = empty()
    const code = generate(format)
    await seed(db, code)

    const anonymous = jarOf(
      await instance(db).api.joinRoom({ body: { code }, asResponse: true })
    )
    const anonymousActor = onlyRow(db.roomActor).id
    const session = await signUp(db)

    const response = await instance(db).api.joinRoom({
      body: { code },
      headers: new Headers({ cookie: `${anonymous}; ${session}` }),
      asResponse: true
    })

    expect(response.status).toBe(200)
    expect(db.roomActor).toHaveLength(2)
    expect(db.roomActor[1]?.userId).toBe(onlyRow(db.user).id)
    expect((await joinedMember(response)).actorId).not.toBe(anonymousActor)
  })

  test('reuses the linked actor when the same user joins again', async () => {
    const db = empty()
    const code = generate(format)
    await seed(db, code)
    const session = await signUp(db)

    await instance(db).api.joinRoom({
      body: { code },
      headers: new Headers({ cookie: session }),
      asResponse: true
    })
    await instance(db).api.joinRoom({
      body: { code },
      headers: new Headers({ cookie: session }),
      asResponse: true
    })

    expect(db.roomActor).toHaveLength(1)
    expect(db.roomMember).toHaveLength(1)
  })
})

describe('rotating the better auth secret', () => {
  test('stops every stored code from resolving', async () => {
    const db = empty()
    const code = generate(format)
    await seed(db, code)

    expect(
      (await instance(db).api.joinRoom({ body: { code }, asResponse: true }))
        .status
    ).toBe(200)

    const rotated = await instance(db, 'a-rotated-secret').api.joinRoom({
      body: { code },
      asResponse: true
    })

    expect(rotated.status).toBe(400)
    expect(await codeOf(rotated)).toBe('CODE_DID_NOT_RESOLVE')
  })
})
