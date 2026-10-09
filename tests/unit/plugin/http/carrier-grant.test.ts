import { describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'

import { SECRET } from '../../../helpers/auth'
import { codeOf, jarOf, joinedMember, onlyRow } from '../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../helpers/memory'

const scenario = async () => {
  const db = empty()
  const code = await seedRoom(db)
  const auth = memoryAuth(db)
  const join = (cookie?: string) =>
    auth.api.joinRoom({
      body: { code },
      asResponse: true,
      ...(cookie === undefined ? {} : { headers: new Headers({ cookie }) })
    })
  const first = await join()
  const cookie = jarOf(first)
  const member = await joinedMember(first)
  const cookieName = cookie.slice(0, cookie.indexOf('='))
  const signed = (payload: string, secret = SECRET) => {
    const signature = createHmac('sha256', secret)
      .update(payload)
      .digest('base64')
    return cookieName + '=' + encodeURIComponent(payload + '.' + signature)
  }
  return { db, join, cookie, member, signed }
}

describe('the signed grant', () => {
  test('accepts an independently signed live grant for an existing actor', async () => {
    const { db, join, member, signed } = await scenario()
    const cookie = signed(
      'v1.0.' + (Date.now() + 60_000) + '.' + member.actorId
    )
    expect(await joinedMember(await join(cookie))).toEqual(member)
    expect(db.roomActor).toHaveLength(1)
    expect(db.roomMember).toHaveLength(1)
  })

  test('rejects a foreign signature even when the claimed actor exists locally', async () => {
    const { db, join, member, signed } = await scenario()
    const cookie = signed(
      'v1.0.' + (Date.now() + 60_000) + '.' + member.actorId,
      'a-different-signing-secret'
    )
    const joined = await joinedMember(await join(cookie))
    expect(joined.actorId).not.toBe(member.actorId)
    expect(db.roomActor).toHaveLength(2)
  })

  test('rejects an expired payload even when its signature and actor are valid', async () => {
    const { db, join, member, signed } = await scenario()
    const cookie = signed('v1.0.0.' + member.actorId)
    expect((await joinedMember(await join(cookie))).actorId).not.toBe(
      member.actorId
    )
    expect(db.roomActor).toHaveLength(2)
  })

  test('rejects a correctly signed malformed payload', async () => {
    const { db, join, member, signed } = await scenario()
    const cookie = signed(
      'v2.0.' + (Date.now() + 60_000) + '.' + member.actorId
    )
    expect((await joinedMember(await join(cookie))).actorId).not.toBe(
      member.actorId
    )
    expect(db.roomActor).toHaveLength(2)
  })
})

describe('grant and membership lifetime', () => {
  test('invalidates the grant when the actor epoch changes', async () => {
    const { db, join, cookie, member } = await scenario()
    onlyRow(db.roomActor).grantEpoch = 1
    expect((await joinedMember(await join(cookie))).actorId).not.toBe(
      member.actorId
    )
    expect(db.roomMember).toHaveLength(2)
  })

  test('reuses the actor across requests while the epoch holds', async () => {
    const { db, join, cookie, member } = await scenario()
    expect(await joinedMember(await join(cookie))).toEqual(member)
    expect(await joinedMember(await join(cookie))).toEqual(member)
    expect(db.roomActor).toHaveLength(1)
    expect(db.roomMember).toHaveLength(1)
  })

  test('keeps a revoked membership blocking the same actor', async () => {
    const { db, join, cookie } = await scenario()
    onlyRow(db.roomMember).revokedAt = new Date()
    const refused = await join(cookie)
    expect(refused.status).toBe(403)
    expect(await codeOf(refused)).toBe('MEMBERSHIP_REVOKED')
    expect(db.roomMember).toHaveLength(1)
    expect(db.roomActor).toHaveLength(1)
  })
})
