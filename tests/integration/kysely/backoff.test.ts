import { describe, expect, test } from 'bun:test'

import { codeOf, postRoute } from '../../helpers/http'
import { sqliteFixture } from '../../helpers/sqlite'

import type { RoomOptions } from '@/plugin/options'

const fixture = sqliteFixture()
const { auth, rows } = fixture

const seed = async () => (await auth().api.createRoom({ body: {} })).code

const attempts = () => rows('roomAttempt')

const guess = (room?: RoomOptions, headers?: Record<string, string>) =>
  postRoute(auth(room), 'join', { code: 'not-a-code' }, headers)

const present = (
  code: string,
  headers?: Record<string, string>,
  room?: RoomOptions
) => postRoute(auth(room), 'join', { code }, headers)

const FROM = { 'x-forwarded-for': '203.0.113.7' }

const guessViaApi = (room?: RoomOptions, headers?: Record<string, string>) =>
  auth(room).api.joinRoom({
    body: { code: 'not-a-code' },
    asResponse: true,
    ...(headers === undefined ? {} : { headers: new Headers(headers) })
  })

describe('the join backoff on the server side path', () => {
  test('counts a failed resolution reached through auth.api', async () => {
    await seed()

    expect((await guessViaApi()).status).toBe(400)
    expect(attempts().map(row => row.key)).toEqual(['global'])
  })

  test('takes the address from forwarded headers and gates on it', async () => {
    await seed()
    const room: RoomOptions = { attempts: { perIp: 2, window: 60 } }

    await guessViaApi(room, FROM)
    await guessViaApi(room, FROM)

    const blocked = await guessViaApi(room, FROM)

    expect(blocked.status).toBe(429)
    expect(await codeOf(blocked)).toBe('TOO_MANY_ATTEMPTS')
    expect(new Set(attempts().map(row => row.key))).toEqual(
      new Set(['global', 'ip:203.0.113.7'])
    )
  })

  test('gates an address-less caller on the global ceiling', async () => {
    await seed()
    const room: RoomOptions = { attempts: { everyone: 2, window: 60 } }

    await guessViaApi(room)
    await guessViaApi(room)

    const blocked = await guessViaApi(room)

    expect(blocked.status).toBe(429)
    expect(await codeOf(blocked)).toBe('TOO_MANY_ATTEMPTS')
  })

  test('still admits a code that resolves on the server side path', async () => {
    const code = await seed()

    expect(
      (
        await auth().api.joinRoom({
          body: { code },
          asResponse: true
        })
      ).status
    ).toBe(200)
  })
})

describe('the join backoff', () => {
  test('counts a failed resolution against the address that tried', async () => {
    await seed()

    expect((await guess(undefined, FROM)).status).toBe(400)

    const counted = attempts()

    expect(counted.map(row => row.key)).toEqual(['global', 'ip:203.0.113.7'])
    expect(counted.every(row => row.count === 1)).toBe(true)
  })

  test('refuses once the per address ceiling is reached', async () => {
    await seed()
    const room: RoomOptions = { attempts: { perIp: 3, window: 60 } }

    expect((await guess(room, FROM)).status).toBe(400)
    expect((await guess(room, FROM)).status).toBe(400)
    expect((await guess(room, FROM)).status).toBe(400)

    const before = attempts()
    const blocked = await guess(room, FROM)

    expect(blocked.status).toBe(429)
    expect(await codeOf(blocked)).toBe('TOO_MANY_ATTEMPTS')
    expect(attempts()).toEqual(before)
    expect(
      Number(attempts().find(entry => entry.key === 'ip:203.0.113.7')?.count)
    ).toBe(3)
  })

  test('does not count a code that resolved', async () => {
    const code = await seed()

    expect((await present(code, FROM)).status).toBe(200)
    expect(attempts()).toHaveLength(0)
  })

  test('leaves a crowd behind one address alone while the code is right', async () => {
    const code = await seed()

    const responses = await Promise.all(
      Array.from({ length: 12 }, () => present(code, FROM))
    )
    expect(responses.map(response => response.status)).toEqual(
      Array.from({ length: 12 }, () => 200)
    )

    expect(attempts()).toHaveLength(0)
  })
})

describe('backoff address isolation', () => {
  test('does not let one address exhaust another', async () => {
    await seed()
    const room: RoomOptions = { attempts: { perIp: 2, window: 60 } }

    await guess(room, FROM)
    await guess(room, FROM)

    const blocked = await guess(room, FROM)
    const elsewhere = await guess(room, { 'x-forwarded-for': '198.51.100.4' })

    expect(blocked.status).toBe(429)
    expect(await codeOf(blocked)).toBe('TOO_MANY_ATTEMPTS')
    expect(elsewhere.status).toBe(400)
    expect(await codeOf(elsewhere)).toBe('CODE_DID_NOT_RESOLVE')
  })

  test('applies the global ceiling to an address that has failed before', async () => {
    await seed()
    const room: RoomOptions = {
      attempts: { everyone: 3, perIp: 99, window: 60 }
    }
    const other = { 'x-forwarded-for': '198.51.100.9' }

    await guess(room, other)
    await guess(room, FROM)
    await guess(room, FROM)

    const blocked = await guess(room, other)

    expect(blocked.status).toBe(429)
    expect(await codeOf(blocked)).toBe('TOO_MANY_ATTEMPTS')
  })
})
