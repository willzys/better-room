import { describe, expect, test } from 'bun:test'

import { codeFormat } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

import { SECRET } from '../../../helpers/auth'
import { codeOf, jarOf, onlyRow } from '../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../helpers/memory'

import type { Room } from '@/core/room'
import type { RoomCode } from '@/core/room-code'
import type { RoomOptions } from '@/plugin/options'
import type { CodeFormatName } from '@/security/code-format'

const past = () => new Date(Date.now() - 60_000)
const future = () => new Date(Date.now() + 60_000)

type Seed = {
  room?: Partial<Room>
  code?: Partial<RoomCode>
  format?: CodeFormatName
  length?: number
}

const scenario = async (seed: Seed) => {
  const db = empty()
  const options: RoomOptions = {
    code: {
      format: seed.format ?? 'crockford',
      length: seed.length ?? (seed.format === 'numeric' ? 6 : 8)
    }
  }
  const code = await seedRoom(db, {
    options,
    ...(seed.room && { room: seed.room }),
    ...(seed.code && { code: seed.code })
  })
  return { db, code, auth: memoryAuth(db, options) }
}

const refusalOf = async (response: Response) => ({
  status: response.status,
  code: await codeOf(response)
})

describe('refusals before the code resolves', () => {
  test.each([
    ['a revoked code', { status: 'revoked' }],
    ['a code revoked by timestamp', { revokedAt: past() }],
    ['a code past its window', { expiresAt: past() }]
  ] as const)('answers %s with the uniform error', async (_label, code) => {
    const { auth, code: value } = await scenario({ code })

    expect(
      await refusalOf(
        await auth.api.joinRoom({ body: { code: value }, asResponse: true })
      )
    ).toEqual({ status: 400, code: 'CODE_DID_NOT_RESOLVE' })
  })

  test('admits a code still inside its grace window', async () => {
    const { auth, code } = await scenario({
      code: { status: 'grace', expiresAt: future() }
    })

    expect(
      (await auth.api.joinRoom({ body: { code }, asResponse: true })).status
    ).toBe(200)
  })
})

describe('refusals once the code has resolved', () => {
  test.each([
    ['closed', { status: 'closed' }, 'ROOM_CLOSED'],
    ['locked', { status: 'locked' }, 'ROOM_LOCKED'],
    ['expired', { expiresAt: past() }, 'ROOM_EXPIRED']
  ] as const)('names a %s room', async (_label, room, expected) => {
    const { auth, code } = await scenario({ room })

    expect(
      await refusalOf(
        await auth.api.joinRoom({ body: { code }, asResponse: true })
      )
    ).toEqual({ status: 403, code: expected })
  })

  test('names an expired membership rather than reinstating it', async () => {
    const { auth, code, db } = await scenario({})
    const first = await auth.api.joinRoom({ body: { code }, asResponse: true })
    const cookie = jarOf(first)
    const member = onlyRow(db.roomMember)

    member.role = 'host'
    member.expiresAt = past()
    member.leftAt = past()

    const again = await auth.api.joinRoom({
      body: { code },
      headers: new Headers({ cookie }),
      asResponse: true
    })

    expect(await refusalOf(again)).toEqual({
      status: 403,
      code: 'MEMBERSHIP_EXPIRED'
    })
    expect(db.roomMember).toHaveLength(1)
    expect(db.roomMember[0]?.role).toBe('host')
  })

  test('reinstates a membership the actor merely left', async () => {
    const { auth, code, db } = await scenario({ room: { maxMembers: 2 } })
    const first = await auth.api.joinRoom({ body: { code }, asResponse: true })
    const cookie = (first.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    const member = onlyRow(db.roomMember)

    member.leftAt = past()
    member.occupancy = 0
    member.releasedAt = past()
    onlyRow(db.room).memberCount = 0

    const again = await auth.api.joinRoom({
      body: { code },
      headers: new Headers({ cookie }),
      asResponse: true
    })

    expect(again.status).toBe(200)
    expect(db.roomMember).toHaveLength(1)
    expect(db.roomMember[0]?.leftAt).toBeNull()
    expect(db.room[0]?.memberCount).toBe(1)
  })
})

describe('the capacity gate at its edges', () => {
  test('refuses everyone when the room holds no seats', async () => {
    const { auth, code } = await scenario({ room: { maxMembers: 0 } })

    expect(
      await refusalOf(
        await auth.api.joinRoom({ body: { code }, asResponse: true })
      )
    ).toEqual({ status: 409, code: 'ROOM_AT_CAPACITY' })
  })

  test('stays closed when the counter has drifted above the limit', async () => {
    const { auth, code, db } = await scenario({
      room: { maxMembers: 2, memberCount: 5 }
    })

    expect(
      await refusalOf(
        await auth.api.joinRoom({ body: { code }, asResponse: true })
      )
    ).toEqual({ status: 409, code: 'ROOM_AT_CAPACITY' })
    expect(db.roomMember).toHaveLength(0)
  })
})

describe('the crockford alphabet', () => {
  test('accepts the ambiguous letters as their canonical digits', async () => {
    const { auth, db } = await scenario({ length: 4 })

    db.roomCode.length = 0
    db.roomCode.push({
      id: 'code-1',
      identifier: await codeIdentifier({
        format: codeFormat('crockford', 4),
        secret: SECRET
      })('1101'),
      roomId: 'room-1',
      status: 'active',
      expiresAt: null,
      revokedAt: null,
      createdAt: past()
    })

    const response = await auth.api.joinRoom({
      body: { code: 'il-o1' },
      asResponse: true
    })

    expect(response.status).toBe(200)
  })
})

describe('the numeric format', () => {
  test('admits a keypad code end to end', async () => {
    const { auth, code } = await scenario({ format: 'numeric', length: 6 })

    expect(code).toMatch(/^\d{6}$/)
    expect(
      (await auth.api.joinRoom({ body: { code }, asResponse: true })).status
    ).toBe(200)
  })

  test('refuses a letter where the format allows only digits', async () => {
    const { auth } = await scenario({ format: 'numeric', length: 6 })

    expect(
      await refusalOf(
        await auth.api.joinRoom({ body: { code: '12A456' }, asResponse: true })
      )
    ).toEqual({ status: 400, code: 'CODE_DID_NOT_RESOLVE' })
  })
})
