import { describe, expect, test } from 'bun:test'

import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { betterRoom } from '@/plugin'
import { ROOM_ERROR_CODES } from '@/plugin/errors/codes'

describe('betterRoom options', () => {
  test.each([0, -1, 1.5, Number.NaN, 60 * 60 * 24 * 401])(
    'rejects the grant lifetime %p at construction',
    lifetime => {
      expect(() => betterRoom({ grant: { lifetime } })).toThrow(RangeError)
    }
  )

  test.each([0, -1, 1.5, Number.NaN])(
    'rejects the grace window %p at construction',
    grace => {
      expect(() => betterRoom({ code: { grace } })).toThrow(RangeError)
    }
  )

  test.each(['window', 'perIp', 'everyone'] as const)(
    'rejects invalid attempt %s at construction',
    field => {
      for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => betterRoom({ attempts: { [field]: value } })).toThrow(
          RangeError
        )
      }
    }
  )
})

describe('betterRoom bounding its windows', () => {
  test.each([60 * 60 * 24 + 1, Number.MAX_SAFE_INTEGER])(
    'rejects the grace window %p for exceeding its ceiling',
    grace => {
      expect(() => betterRoom({ code: { grace } })).toThrow(RangeError)
    }
  )

  test.each([60 * 60 * 24 + 1, Number.MAX_SAFE_INTEGER])(
    'rejects the attempt window %p for exceeding its ceiling',
    window => {
      expect(() => betterRoom({ attempts: { window } })).toThrow(RangeError)
    }
  )

  test('accepts a grace window and an attempt window of a whole day', () => {
    expect(() =>
      betterRoom({
        code: { grace: 60 * 60 * 24 },
        attempts: { window: 60 * 60 * 24 }
      })
    ).not.toThrow()
  })
})

describe('betterRoom accepting a usable code', () => {
  test('rejects an unusable code length at construction', () => {
    expect(() => betterRoom({ code: { length: 0 } })).toThrow(RangeError)
  })

  test.each(['hex', 'toString', ''])(
    'rejects the unknown code format %p at construction',
    format => {
      expect(() =>
        Reflect.apply(betterRoom, undefined, [{ code: { format } }])
      ).toThrow(new TypeError('code format must be one of crockford, numeric'))
    }
  )

  test('accepts the numeric format with its own length', () => {
    expect(() =>
      betterRoom({ code: { format: 'numeric', length: 6 } })
    ).not.toThrow()
  })

  test('declares the room endpoint and every room table', () => {
    const plugin = betterRoom()

    expect(new Set(Object.keys(plugin.endpoints))).toEqual(
      new Set([
        'addRoomMember',
        'closeRoom',
        'createRoom',
        'lockRoom',
        'reconcileRoomCapacity',
        'revokeRoomMember',
        'unlockRoom',
        'getRoomAccess',
        'getRoomOccupancy',
        'joinRoom',
        'leaveRoom',
        'listRoomMemberships',
        'promoteRoomActor',
        'rotateRoomCode'
      ])
    )
    expect(new Set(Object.keys(plugin.schema))).toEqual(
      new Set(['room', 'roomActor', 'roomAttempt', 'roomCode', 'roomMember'])
    )
  })
})

describe('betterRoom error codes', () => {
  test('reaches the application through the auth instance', () => {
    const auth = betterAuth({
      secret: 'options-secret',
      baseURL: 'http://localhost:3000',
      database: memoryAdapter({}),
      plugins: [betterRoom()]
    })

    expect(auth.$ERROR_CODES.CODE_DID_NOT_RESOLVE).toEqual(
      ROOM_ERROR_CODES.CODE_DID_NOT_RESOLVE
    )
  })

  test('keeps every code equal to its own key', () => {
    for (const [key, error] of Object.entries(ROOM_ERROR_CODES)) {
      expect(key).toBe(error.code)
    }
  })
})
